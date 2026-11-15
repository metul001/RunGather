-- Transport shares event ownership, approval and RLS. No client direct writes.
alter table public.events
 add column transport_status text not null default 'unknown' check (transport_status in ('unknown','available','unavailable')),
 add column transport_details text not null default '' check (length(transport_details)<=2000),
 add column transport_url text check (transport_url is null or (length(transport_url)<=2048 and transport_url ~ '^https://[^/@[:space:]]+(\.[^/@[:space:]]+)?(/[^[:space:]]*)?$')),
 add constraint transport_information check (transport_status <> 'available' or length(trim(transport_details)) >= 10);
drop view public.event_directory;
create view public.event_directory with (security_invoker=true) as select e.*,o.name as organizer_name,o.verified as organizer_verified,r.average_rating,coalesce(r.review_count,0) as review_count,d.name as division_name,di.name as district_name,c.name as category_name,
 case when e.cancelled then 'cancelled' when e.ends_at<=now() then 'completed' when e.starts_at<=now() then 'ongoing' else 'upcoming' end as status,
 public.event_popularity(e.id) as popularity
 from public.events e join public.organizers o on o.id=e.organizer_id join public.divisions d on d.id=e.division_id join public.districts di on di.id=e.district_id join public.categories c on c.id=e.category_id left join public.organizer_ratings r on r.organizer_id=o.id where e.approval='approved' and private.visible_org(o.id);

grant select on public.event_directory to anon,authenticated;
alter function public.save_event(jsonb,uuid) rename to save_event_base;
revoke all on function public.save_event_base(jsonb,uuid) from public,anon,authenticated;
create function public.save_event(data jsonb,event_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare eid uuid; begin
 eid := public.save_event_base(data,event_id);
 update public.events set
 transport_status=coalesce(data->>'transport_status','unknown'),
 transport_details=coalesce(data->>'transport_details',''),
 transport_url=nullif(data->>'transport_url','') where id=eid;
 return eid;
end $$;
revoke all on function public.save_event(jsonb,uuid) from public,anon;
grant execute on function public.save_event(jsonb,uuid) to authenticated;
