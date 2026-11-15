# Security model and release checklist

Security controls are implemented, but this source has not undergone an independent security audit or live-service penetration test. No immunity to hacking is claimed.

## Implemented controls

- Passwords are handled by Supabase Auth, not by app tables or custom code. Hosted Supabase Auth uses its managed password hashing; do not replace it with plaintext or a client-side hash.
- Native sessions use platform SecureStore with small encrypted chunks. The OS/device trust boundary still matters; rooted/jailbroken devices are outside this protection.
- Empty-search-path security-definer RPCs validate active users, organizer ownership, review eligibility and administrative MFA. Client UI visibility does not grant permission.
- All application tables have RLS. Private profiles, bookmarks, registrations, reviews under moderation, inbox messages and reports have scoped reads. Direct writes to roles, approvals, audit logs, attendance and scores are unavailable to clients.
- An administrator must hold a server-maintained role and a JWT with `aal2`. The first role is assigned through the privileged SQL console, not an app input.
- Parameterized Supabase queries and fixed SQL statements avoid string-interpolated SQL. React Native Text displays text instead of injecting HTML. External links are HTTPS only and reject embedded credentials in the mobile client; database constraints reject non-HTTPS schemes.
- Domain constraints enforce district/division consistency, date order, nonnegative fees, mandatory external links for paid events and one review per person/event.
- Per-user hourly limits cover organization/event changes, verification requests, registrations, reviews, replies, reports, attendance confirmation and uploads. Supabase Auth sign-in throttling is separately configured in the provider dashboard.
- Images use private buckets, short-lived signed read URLs, authenticated upload permission, actual streamed byte limits and JPEG/PNG signature checks. Clients cannot upload directly to storage or attach another owner's image path. The client re-encodes images; a malicious client can bypass client preprocessing, so signatures are not a complete malware/image-decoder inspection service. Add server-side decode/re-encode/antimalware scanning for higher assurance before broad public uploads.
- Administrator decisions are appended to an audit log that client roles cannot write or erase. This log does not capture privileged manual SQL-console changes; use provider/database auditing operationally.
- Push jobs require a separate server secret; service-role-only RPCs cannot be called by mobile users, including app admins. Remote push content is generic.

## Configuration-dependent controls

Encryption in transit requires the hosted HTTPS endpoint. Encryption at rest is a hosting/storage infrastructure responsibility, not something demonstrated by an SQL migration. Verify the selected provider/project's encryption and backup configuration; use disk/backup encryption for self-hosted environments. Do not claim that local test files are encrypted at rest.

Set strong password policy, email verification, SMTP, Auth rate limits, TOTP, redirect allowlists and token lifetimes. Test leaked-password protections/captcha integrations if enabled. Restrict privileged database accounts, rotate leaked keys, and never expose `service_role` or database passwords in app code.

Signing keys, FCM/APNs credentials, push dispatcher secrets and email credentials belong in private credential stores. Public Supabase URL/key are expected in the app and are safe only in combination with correctly deployed RLS and grants.

## Backups and recovery

`scripts/backup.sh` is a basic private `pg_dump` helper. A full recovery plan also needs image object exports, Auth/provider configuration, secrets recovery and signing-key backups. Managed project restores differ from raw PostgreSQL restores: follow provider guidance and avoid overwriting protected Auth/Storage system schemas blindly.

Define a recovery-point and recovery-time objective. Keep encrypted off-site copies with limited access. Restore to an isolated staging environment, verify row counts and file retrieval, then run ownership/MFA/review tests before considering a restore successful. Automated backups, object retention, recovery drills and a scheduler are not deployed by this ZIP.

## Mandatory prelaunch gates

- [ ] All migrations applied to a dedicated project; no extra permissive policies.
- [ ] Hosted unauthorized API/RLS tests executed with two normal users, two organizers and an MFA admin.
- [ ] Email verification/reset/deep links tested on Android and iOS.
- [ ] TOTP enrollment, AAL1 denial, AAL2 allow and loss/recovery procedure tested.
- [ ] Storage unauthorized read/write, invalid images, oversized body and owner-path checks tested via HTTP.
- [ ] No real secrets in git, app bundle, logs or archive.
- [ ] Dependency audit reviewed and critical/high exploitable findings resolved.
- [ ] Privacy policy, account deletion, moderation/appeals and support contacts implemented.
- [ ] Android/iOS accessibility and UI acceptance tests passed.
- [ ] Backup restore, monitoring, abuse response and push failure handling exercised.
- [ ] A qualified independent review completed before public deployment.

## Known operational boundaries

Organizer-confirmed attendance can be fraudulent; moderation and independent evidence are needed. Admins can make erroneous approval decisions. Direct owner collection writes are RLS protected but do not all have custom rate-limit RPCs; apply gateway/resource abuse controls and monitor usage. Participant search/count endpoints now run on the server with bounded pages/windows; some management lists still use full reads. Benchmark query plans, configure gateway abuse controls and test concurrent reservations before very large-scale use. Ordinary user account deletion and privacy self-service export are not implemented yet. Do not submit a production release without resolving the relevant platform/privacy requirements.

## Transport, offline copies and diagnostics

Transport writes use scoped RPCs; service locks serialize seat allocation, verification and cancellation. Verification evidence stays in a private schema. Passengers can read their own reservation, while active event owners and MFA administrators can read the manifest. No client has direct transport write privileges. Event/organizer visibility changes invalidate verification and affected reservations. Payment/refund processing is external.

Offline snapshots use account-specific native SecureStore keys, explicit expiry/size limits and a public-field allowlist. Signed URLs, auth tokens and passenger data are excluded. Session/account changes gate the displayed snapshot. Diagnostics retain only bounded category/duration/success samples in memory and require a user share action to export. These mechanisms still require native-device acceptance testing.
