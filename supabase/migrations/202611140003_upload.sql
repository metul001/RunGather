create function public.check_upload_permission() returns void language plpgsql security definer set search_path='' as $$ begin perform private.limit_action('upload',20); if not exists(select 1 from public.organizers where owner_id=auth.uid() and not suspended) then raise exception 'Organizer profile required'; end if; end $$;
revoke all on function public.check_upload_permission() from public,anon;
grant execute on function public.check_upload_permission() to authenticated;
-- Prevent assigning another account's private object path to a publicly readable event.
create function private.validate_asset_owner() returns trigger language plpgsql security definer set search_path='' as $$ declare path text; owner uuid; begin
 if TG_TABLE_NAME='events' then path:=new.cover_path; select owner_id into owner from public.organizers where id=new.organizer_id;
 else path:=new.logo_path; owner:=new.owner_id; end if;
 if path is not null and (split_part(path,'/',1)<>owner::text or path !~ '^[0-9a-f-]+/[0-9a-f-]+\.(jpg|png)$' or not exists(select 1 from storage.objects where bucket_id='event-images' and name=path)) then raise exception 'Image must be an uploaded image owned by this organizer'; end if;
 return new; end $$;
create trigger event_asset before insert or update on public.events for each row execute function private.validate_asset_owner();
create trigger organizer_asset before insert or update on public.organizers for each row execute function private.validate_asset_owner();
revoke all on function private.validate_asset_owner() from public,anon,authenticated;
