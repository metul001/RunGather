-- A device belongs to the most recently signed-in user who enables notifications on it.
-- Expo tokens are opaque routing identifiers, not authentication credentials.
create unique index push_token_unique_device on public.push_tokens(token);
revoke insert,update on public.push_tokens from authenticated;
create function public.register_push(device_token text) returns void language plpgsql security definer set search_path='' as $$ begin
 perform private.limit_action('push_registration',10);
 if length(device_token)>256 or device_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' then raise exception 'Invalid push token'; end if;
 insert into public.push_tokens(user_id,token) values(auth.uid(),device_token) on conflict(token) do update set user_id=excluded.user_id;
 end $$;
revoke all on function public.register_push(text) from public,anon;
grant execute on function public.register_push(text) to authenticated;
