create table public.transport_services (
 id uuid primary key default gen_random_uuid(), event_id uuid not null unique references public.events on delete cascade,
 provider text not null check(length(trim(provider)) between 3 and 120),
 contact text not null check(length(trim(contact)) between 3 and 200),
 pickup text not null check(length(trim(pickup)) between 3 and 500),
 departs_at timestamptz not null, returns_at timestamptz not null, booking_closes timestamptz not null,
 capacity integer not null check(capacity between 1 and 1000), fare numeric(10,2) not null check(fare>=0),
 verified boolean not null default false, cancelled boolean not null default false,
 updated_at timestamptz not null default now(), check(returns_at>departs_at), check(booking_closes<=departs_at)
);
create table public.transport_bookings (
 service_id uuid not null references public.transport_services on delete cascade,
 user_id uuid not null references public.profiles on delete cascade,
 seats integer not null check(seats between 1 and 4), status text not null check(status in ('reserved','cancelled')),
 updated_at timestamptz not null default now(), primary key(service_id,user_id)
);
create index transport_reserved on public.transport_bookings(service_id) where status='reserved';
create table private.transport_verifications (
 service_id uuid not null references public.transport_services on delete cascade,
 admin_id uuid not null references public.profiles, evidence text not null check(length(trim(evidence)) between 20 and 2000),
 verified boolean not null, created_at timestamptz not null default now()
);
create function private.transport_owner(sid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.transport_services s join public.events e on e.id=s.event_id where s.id=sid and private.owns(e.organizer_id)) $$;
revoke all on function private.transport_owner(uuid) from public;
grant execute on function private.transport_owner(uuid) to authenticated;
alter table public.transport_services enable row level security;
alter table public.transport_bookings enable row level security;
revoke all on public.transport_services,public.transport_bookings from anon,authenticated;
grant select on public.transport_services to anon,authenticated;
grant select on public.transport_bookings to authenticated;
create policy transport_service_public on public.transport_services for select to anon,authenticated using
 (verified and not cancelled and private.visible_event(event_id));
create policy transport_service_private on public.transport_services for select to authenticated using
 (private.transport_owner(id) or private.admin() or exists(select 1 from public.transport_bookings b where b.service_id=id and b.user_id=auth.uid()));
create policy transport_booking_read on public.transport_bookings for select to authenticated using
 ((user_id=auth.uid() and private.active()) or private.transport_owner(service_id) or private.admin());
-- Aggregated inventory only; participant identifiers never exposed by this RPC.
create function public.transport_availability(sid uuid) returns integer language sql stable security definer set search_path='' as $$
 select greatest(0,s.capacity-coalesce((select sum(b.seats)::integer from public.transport_bookings b where b.service_id=s.id and b.status='reserved'),0))
 from public.transport_services s join public.events e on e.id=s.event_id
 where s.id=sid and s.verified and not s.cancelled and private.visible_event(e.id) and not e.cancelled
 and s.booking_closes>now() and s.departs_at>now() $$;
revoke all on function public.transport_availability(uuid) from public;
grant execute on function public.transport_availability(uuid) to anon,authenticated;

create function public.save_transport(eid uuid, data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.events; sid uuid; begin
 perform private.limit_action('transport_edit',30);
 select * into e from public.events where id=eid for update;
 if not found or not private.owns(e.organizer_id) then raise exception 'Not your event' using errcode='42501'; end if;
 if e.cancelled or e.starts_at<=now() then raise exception 'Event cannot accept transport'; end if;
 select id into sid from public.transport_services where event_id=eid for update;
 if exists(select 1 from public.transport_bookings where service_id=sid and status='reserved') then raise exception 'Cancel this service and notify passengers before changing booked transport'; end if;
 if (data->>'departs_at')::timestamptz<=now() or (data->>'booking_closes')::timestamptz<=now() or (data->>'departs_at')::timestamptz>e.starts_at or (data->>'returns_at')::timestamptz<e.ends_at then raise exception 'Transport must depart before the event, return after it and have a future booking deadline'; end if;
 insert into public.transport_services(event_id,provider,contact,pickup,departs_at,returns_at,booking_closes,capacity,fare)
 values(eid,data->>'provider',data->>'contact',data->>'pickup',(data->>'departs_at')::timestamptz,(data->>'returns_at')::timestamptz,(data->>'booking_closes')::timestamptz,(data->>'capacity')::integer,(data->>'fare')::numeric)
 on conflict(event_id) do update set provider=excluded.provider,contact=excluded.contact,pickup=excluded.pickup,departs_at=excluded.departs_at,returns_at=excluded.returns_at,booking_closes=excluded.booking_closes,capacity=excluded.capacity,fare=excluded.fare,verified=false,cancelled=false,updated_at=now()
 returning id into sid;
 return sid;
end $$;

create function private.cancel_transport_bookings(sid uuid) returns void language plpgsql security definer set search_path='' as $$
declare eid uuid; begin
 select event_id into eid from public.transport_services where id=sid;
 insert into public.notifications(user_id,event_id,title,body)
 select user_id,eid,'Transport reservation cancelled','The transport service changed or was cancelled. Contact the organizer about travel and any payment made outside RunGather.' from public.transport_bookings where service_id=sid and status='reserved';
 update public.transport_bookings set status='cancelled',updated_at=now() where service_id=sid and status='reserved';
end $$;
revoke all on function private.cancel_transport_bookings(uuid) from public,anon,authenticated;

create function public.verify_transport(sid uuid, approved boolean, evidence text) returns void language plpgsql security definer set search_path='' as $$
declare eid uuid; begin
 if not private.admin() then raise exception 'Administrator MFA required' using errcode='42501'; end if;
 perform private.limit_action('transport_verify',60);
 select event_id into eid from public.transport_services where id=sid;
 perform 1 from public.events where id=eid for update;
 perform 1 from public.transport_services where id=sid for update;
 if not found then raise exception 'Transport unavailable'; end if;
 if approved and not exists(select 1 from public.transport_services s join public.events e on e.id=s.event_id where s.id=sid and not s.cancelled and s.booking_closes>now() and not e.cancelled and private.visible_event(e.id)) then raise exception 'Approve a visible active event before its transport'; end if;
 insert into private.transport_verifications(service_id,admin_id,evidence,verified) values(sid,auth.uid(),evidence,approved);
 update public.transport_services set verified=approved,updated_at=now() where id=sid;
 if not approved then perform private.cancel_transport_bookings(sid); end if;
 insert into public.admin_audit_logs(admin_id,action,target_id) values(auth.uid(),case when approved then 'verify_transport' else 'revoke_transport' end,sid);
end $$;

create function public.reserve_transport(sid uuid, requested_seats integer) returns void language plpgsql security definer set search_path='' as $$
declare s public.transport_services; e public.events; used integer; begin
 perform private.limit_action('transport_booking',60);
 if requested_seats not between 1 and 4 or requested_seats is null then raise exception 'Choose 1 to 4 seats'; end if;
 select ev.* into e from public.events ev join public.transport_services t on t.event_id=ev.id where t.id=sid for update of ev;
 select * into s from public.transport_services where id=sid for update;
 if not found or not private.visible_event(e.id) or e.cancelled or not s.verified or s.cancelled or s.booking_closes<=now() or s.departs_at<=now() then raise exception 'Transport booking unavailable'; end if;
 select coalesce(sum(seats),0)::integer into used from public.transport_bookings where service_id=sid and status='reserved' and user_id<>auth.uid();
 if used+requested_seats>s.capacity then raise exception 'Not enough seats available'; end if;
 insert into public.transport_bookings(service_id,user_id,seats,status) values(sid,auth.uid(),requested_seats,'reserved')
 on conflict(service_id,user_id) do update set seats=excluded.seats,status='reserved',updated_at=now();
end $$;
create function public.cancel_transport_booking(sid uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_user();
 perform 1 from public.transport_services where id=sid for update;
 update public.transport_bookings set status='cancelled',updated_at=now() where service_id=sid and user_id=auth.uid();
end $$;
create function public.cancel_transport_service(sid uuid) returns void language plpgsql security definer set search_path='' as $$
declare eid uuid; begin
 perform private.require_user();
 select event_id into eid from public.transport_services where id=sid;
 perform 1 from public.events where id=eid for update;
 perform 1 from public.transport_services where id=sid for update;
 if not found or not (private.transport_owner(sid) or private.admin()) then raise exception 'Transport owner required' using errcode='42501'; end if;
 update public.transport_services set cancelled=true,verified=false,updated_at=now() where id=sid;
 perform private.cancel_transport_bookings(sid);
end $$;
-- Event edits, rejection, rescheduling or cancellation invalidate the verified itinerary.
create function private.event_transport_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid; begin
 if new.cancelled is distinct from old.cancelled or new.approval is distinct from old.approval or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.venue is distinct from old.venue or new.address is distinct from old.address then
  for sid in select id from public.transport_services where event_id=new.id and verified for update loop
   update public.transport_services set verified=false,updated_at=now() where id=sid;
   perform private.cancel_transport_bookings(sid);
  end loop;
 end if;
 return new;
end $$;
create trigger transport_event_changed after update on public.events for each row execute function private.event_transport_changed();
revoke all on function private.event_transport_changed() from public,anon,authenticated;
revoke all on function public.save_transport(uuid,jsonb),public.verify_transport(uuid,boolean,text),public.reserve_transport(uuid,integer),public.cancel_transport_booking(uuid),public.cancel_transport_service(uuid) from public,anon;
grant execute on function public.save_transport(uuid,jsonb),public.verify_transport(uuid,boolean,text),public.reserve_transport(uuid,integer),public.cancel_transport_booking(uuid),public.cancel_transport_service(uuid) to authenticated;

-- Organizer suspension or a profile change that hides its events also invalidates services.
create function private.organizer_transport_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid; begin
 if new.approval is distinct from old.approval or new.suspended is distinct from old.suspended then
  for sid in select s.id from public.transport_services s join public.events e on e.id=s.event_id where e.organizer_id=new.id and s.verified order by s.id for update of s loop
   update public.transport_services set verified=false,updated_at=now() where id=sid;
   perform private.cancel_transport_bookings(sid);
  end loop;
 end if;
 return new;
end $$;
create trigger transport_organizer_changed after update on public.organizers for each row execute function private.organizer_transport_changed();
revoke all on function private.organizer_transport_changed() from public,anon,authenticated;
create function private.suspended_transport_owner() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid; begin
 if new.suspended and not old.suspended then
  for sid in select s.id from public.transport_services s join public.events e on e.id=s.event_id join public.organizers o on o.id=e.organizer_id where o.owner_id=new.id and s.verified order by s.id for update of s loop
   update public.transport_services set verified=false,updated_at=now() where id=sid;
   perform private.cancel_transport_bookings(sid);
  end loop;
 end if;
 return new;
end $$;
create trigger transport_owner_suspended after update on public.profiles for each row execute function private.suspended_transport_owner();
revoke all on function private.suspended_transport_owner() from public,anon,authenticated;
