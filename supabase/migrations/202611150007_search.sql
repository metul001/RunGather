-- Bounded server search; SQL arguments are never interpolated into dynamic SQL.
alter table public.events add column search_document tsvector generated always as
 (to_tsvector('simple', name || ' ' || description || ' ' || venue || ' ' || address)) stored;
create index events_search_document on public.events using gin(search_document);
create index events_browse on public.events(starts_at,id) where approval='approved';
create index saved_event_lookup on public.saved_events(event_id,user_id);

-- Caller-only save membership without granting anonymous access to private saves.
create function private.saved_by_me(eid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.active() and exists(select 1 from public.saved_events s where s.event_id=eid and s.user_id=auth.uid()) $$;
revoke all on function private.saved_by_me(uuid) from public;
grant execute on function private.saved_by_me(uuid) to anon,authenticated;

create function public.search_events(filters jsonb default '{}', page_offset integer default 0, page_size integer default 20)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; q text:=trim(coalesce(filters->>'query','')); today date:=(now() at time zone 'Asia/Dhaka')::date;
period text:=coalesce(filters->>'period','upcoming'); ordering text:=coalesce(filters->>'sort','date');
begin
 if page_size is null or page_offset is null or page_size not between 1 and 50 or page_offset not between 0 and 10000 or length(q)>200 then raise exception 'Invalid search page'; end if;
 if period not in ('all','upcoming','today','week','month') or ordering not in ('date','rating','popularity') or coalesce(filters->>'price','all') not in ('all','free','paid') then raise exception 'Invalid search filter'; end if;
 with matched as (
 select e.* from public.event_directory e join public.events base on base.id=e.id
 where (q='' or base.search_document @@ plainto_tsquery('simple',q)
   or strpos(lower(e.organizer_name),lower(q))>0 or strpos(lower(e.division_name),lower(q))>0
   or strpos(lower(e.district_name),lower(q))>0 or strpos(lower(e.category_name),lower(q))>0
   or to_char(e.starts_at at time zone 'Asia/Dhaka','YYYY-MM-DD')=q)
 and (nullif(filters->>'division','') is null or e.division_id=(filters->>'division')::integer)
 and (nullif(filters->>'district','') is null or e.district_id=(filters->>'district')::integer)
 and (nullif(filters->>'category','') is null or e.category_id=(filters->>'category')::integer)
 and (nullif(filters->>'organizer','') is null or e.organizer_id=(filters->>'organizer')::uuid)
 and (nullif(filters->>'date','') is null or (e.starts_at>=(filters->>'date')::date::timestamp at time zone 'Asia/Dhaka' and e.starts_at<((filters->>'date')::date+1)::timestamp at time zone 'Asia/Dhaka'))
 and (nullif(filters->>'from','') is null or e.starts_at >= (filters->>'from')::timestamptz)
 and (nullif(filters->>'until','') is null or e.starts_at < (filters->>'until')::timestamptz)
 and (not coalesce((filters->>'exclude_cancelled')::boolean,false) or not e.cancelled)
 and (not coalesce((filters->>'saved_only')::boolean,false) or private.saved_by_me(e.id))
 and (coalesce(filters->>'price','all')='all' or (filters->>'price'='free' and e.price=0) or (filters->>'price'='paid' and e.price>0))
 and (period='all' or (period='upcoming' and e.ends_at>now() and not e.cancelled)
   or (period='today' and e.starts_at>=today::timestamp at time zone 'Asia/Dhaka' and e.starts_at<(today+1)::timestamp at time zone 'Asia/Dhaka')
   or (period='week' and e.starts_at>=(today-extract(dow from today)::integer)::timestamp at time zone 'Asia/Dhaka' and e.starts_at<(today-extract(dow from today)::integer+7)::timestamp at time zone 'Asia/Dhaka')
   or (period='month' and e.starts_at>=date_trunc('month',today::timestamp) at time zone 'Asia/Dhaka' and e.starts_at<(date_trunc('month',today::timestamp)+interval '1 month') at time zone 'Asia/Dhaka'))
 ), ordered as (
 select * from matched order by
 case when ordering='rating' then coalesce(average_rating,-1) end desc,
 case when ordering='popularity' then popularity end desc, starts_at,id
 offset page_offset limit page_size+1
 ), numbered as (select *, row_number() over (order by
 case when ordering='rating' then coalesce(average_rating,-1) end desc,
 case when ordering='popularity' then popularity end desc, starts_at,id) as page_row from ordered)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(n)-'page_row' order by page_row) from numbered n where page_row<=page_size),'[]'::jsonb),
 'has_more',(select count(*)>page_size from numbered), 'offset',page_offset) into result;
 return result;
end $$;
revoke all on function public.search_events(jsonb,integer,integer) from public;
grant execute on function public.search_events(jsonb,integer,integer) to anon,authenticated;

-- Calendar aggregates a bounded date window, never downloads all listings to count them.
create function public.calendar_counts(filters jsonb, first_day date, last_day date)
returns table(day text,total bigint) language plpgsql stable security invoker set search_path='' as $$
declare q text:=trim(coalesce(filters->>'query','')); begin
 if first_day is null or last_day is null or last_day<first_day or last_day-first_day>42 or length(q)>200 then raise exception 'Invalid calendar window'; end if;
 return query select to_char(e.starts_at at time zone 'Asia/Dhaka','YYYY-MM-DD'),count(*)
 from public.event_directory e join public.events base on base.id=e.id
 where not e.cancelled and e.starts_at>=first_day::timestamp at time zone 'Asia/Dhaka'
 and e.starts_at<(last_day+1)::timestamp at time zone 'Asia/Dhaka'
 and (q='' or base.search_document @@ plainto_tsquery('simple',q) or strpos(lower(e.organizer_name||' '||e.division_name||' '||e.district_name||' '||e.category_name),lower(q))>0 or to_char(e.starts_at at time zone 'Asia/Dhaka','YYYY-MM-DD')=q)
 and (nullif(filters->>'division','') is null or e.division_id=(filters->>'division')::integer)
 and (nullif(filters->>'district','') is null or e.district_id=(filters->>'district')::integer)
 and (nullif(filters->>'category','') is null or e.category_id=(filters->>'category')::integer)
 and (coalesce(filters->>'price','all')='all' or (filters->>'price'='free' and e.price=0) or (filters->>'price'='paid' and e.price>0))
 group by 1;
end $$;
revoke all on function public.calendar_counts(jsonb,date,date) from public;
grant execute on function public.calendar_counts(jsonb,date,date) to anon,authenticated;
