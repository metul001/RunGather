# Database, authentication and first administrator

## 1. Create your project

Create a Supabase project in your account. Keep the database password private. Obtain the project URL and public anon/publishable key from its API settings. Only these two public values belong in the mobile `.env`.

Install the Supabase CLI using its official supported installation instructions, then use either the hosted or local workflow below. Docker is required for local Supabase, but not for the embedded database tests.

## 2. Apply migrations to an empty project

From the project root:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Use a **new dedicated project**. The migrations set privileges on the public schema's application functions; do not apply them blindly to a database hosting unrelated applications. Review changes before applying them to any existing environment.

The eight migrations create:

1. Core schema, geography, approval/registration/review RPCs, private collection policies and push outbox.
2. Private image bucket and authorized reads.
3. Image permission checks, upload throttling and ownership validation.
4. Push ticket/receipt persistence and service-only receipt functions.
5. Rate-limited device registration and single-account device routing.
6. Organizer-listed transport information and submission validation.
7. Indexed server event search/pagination and bounded calendar aggregates.
8. Transport inventory, private seat reservations, MFA verification and cancellation lifecycle.

For upgrades of this app's dedicated database, back up and test first, then use `supabase db push` to apply only unapplied migrations. Do not use `db reset` against production. See [UPDATE-NOTES.md](UPDATE-NOTES.md) for the transport review workflow.

No real events, organizers or sample ratings are inserted. The Auth schema and Storage service are supplied by Supabase. Tables are accessible only through the documented grants and policies.

For local full-stack development instead:

```sh
supabase start
supabase db reset
supabase status
```

Use the returned local API URL/key. On a physical phone, `127.0.0.1` refers to the phone; use your computer's reachable local-network address for development. Do not expose local development ports to the public Internet. Use the hosted HTTPS endpoint for deployment.

## 3. Configure Auth explicitly in the hosted dashboard

The local TOML does not automatically change your hosted dashboard settings.

- Enable email/password sign-up and **email confirmation**.
- Minimum password length: 12 or more.
- Enable TOTP enrollment and verification.
- Allow exact redirect URLs `rungather://auth/callback` and `rungather://auth/reset`.
- Configure custom SMTP and a verified sender for real users. Provider default email services can restrict recipients or volume and are not a production mailing strategy.
- Configure sign-in and email-send rate limits. Enable leaked-password protections and abuse controls if supported by your selected plan. This app does not implement a CAPTCHA UI; if you require CAPTCHA, implement and test that integration before enabling it.
- Review session lifetimes and refresh-token protections.

Sign-up sends a verification link. Password reset sends a recovery link. Open the link on the same device/app instance that initiated the PKCE flow. Email templates must retain the provider's correct confirmation URL format. The native deep-link handler exchanges the returned authorization code and exposes password update on recovery.

For local Supabase, inspect its local mail catcher to test verification and password recovery without an external SMTP provider. Configure physical-device network addressing and deep links carefully.

## 4. Bootstrap the first administrator

Create and verify your own account through the app. In Supabase's SQL editor, find that account's ID by its known email:

```sql
select id, email from auth.users where email = 'YOUR_ADMIN_EMAIL';
```

Copy the exact returned UUID into:

```sql
update public.user_roles
set role = 'admin'
where user_id = 'EXACT_RETURNED_USER_UUID';
```

Do not enable public client role assignment. The SQL console is a privileged operational channel. Never publish a service-role key or database password to make the administrator screen work.

Sign out and back in. Open Profile -> Administrator two-factor authentication. Enroll a TOTP authenticator using the provided setup key, then verify its six-digit code. Open the administrator dashboard and recheck access. The database denies admin writes unless the session is AAL2; ordinary sign-in is insufficient.

For future administrator changes, use a restricted operational process and record role changes outside the app audit log. The mobile app intentionally cannot promote accounts.

## 5. Add the first real organizer and event

1. Sign up as an organizer using a different verified account.
2. Profile -> Organizer dashboard -> create organizer profile.
3. Sign in as an MFA-verified admin and approve that profile.
4. The organizer can upload a logo, create an event and submit it.
5. Admin approves the event. It becomes available in public discovery and the calendar.
6. Editing an organizer profile clears verification and requires reapproval. Editing an event also requires reapproval.

Verification evidence should be a public official website/contact trail, not sensitive identity documents. Verify it independently before approving a verification request.

## 6. Deploy the upload function

```sh
supabase functions deploy upload-image
```

JWT gateway verification is disabled for this function so that it can explicitly validate the caller with `auth.getUser()` and enforce organizer permission. This is **not** an unauthenticated upload endpoint. The function uses the automatically supplied server environment variables. Never copy its service credentials into `.env`.

Uploads are restricted to JPEG/PNG signatures, a bounded 5 MB body, authenticated active organizers, twenty uploads per hour, private storage and owner-specific paths. Mobile uploads are re-encoded to JPEG. Do not upload sensitive documents or private personal photos.

## 7. Verify access after deployment

Run the automated tests, then the hosted and device acceptance matrix in TESTING.md. A passing local database test does not prove that hosted SMTP, gateway settings, deployment secrets, storage policies or redirect URLs are configured correctly.

Official references:
- https://supabase.com/docs/guides/auth/quickstarts/react-native
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/auth-mfa
- https://supabase.com/docs/guides/storage/security/access-control
