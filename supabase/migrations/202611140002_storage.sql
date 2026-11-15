insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('event-images','event-images',false,5242880,array['image/jpeg','image/png']) on conflict(id) do nothing;
create policy event_images_read on storage.objects for select to anon,authenticated using(bucket_id='event-images' and (
 ((storage.foldername(name))[1]=auth.uid()::text and private.active()) or private.admin() or
 exists(select 1 from public.events e where e.cover_path=storage.objects.name and private.visible_event(e.id)) or
 exists(select 1 from public.organizers o where o.logo_path=storage.objects.name and private.visible_org(o.id))));
-- No client INSERT/UPDATE policy. Uploads pass through the authenticated upload-image function.
