# Architecture

RunGather is a native React Native/Expo application for Android and iOS. It does not wrap the earlier HTML prototype. The green, lime and cream palette, event-card structure and discovery concept carry forward. No separate UI image was attached to this request.

## Runtime

- Five bottom tabs: Home, Calendar, Discover, Saved, Profile. Detail screens, organizer dashboard and administrator dashboard use a native view stack with hardware-back support.
- Supabase Auth supplies email verification, password authentication, PKCE recovery and TOTP MFA. Tokens use chunked native SecureStore storage, not unencrypted browser local storage.
- PostgreSQL is the authoritative source. Read requests use Supabase's generated REST API under the caller's JWT. Every public table has RLS; explicit grants constrain operations.
- Owner writes go through security-definer RPCs with an empty search path and explicit ownership checks. Every public RPC has an explicit execution allowlist.
- The admin dashboard is inside the mobile application. An administrator database role plus an AAL2 session is required by the database. It is not a separate hosted website.
- Participant event lists use the caller-scoped `search_events` RPC with bounded pages and server filters/sorts. Calendar uses a bounded `calendar_counts` window and selected-day pages. Detail records load on demand; the full public catalogue is no longer fetched at startup.
- English/Bangla participant UI uses an explicit UI-copy dictionary and persisted device choice; user content remains untouched. Account-scoped SecureStore snapshots provide bounded, expiring offline saved-event text summaries.
- Performance metrics are session-local, sanitized and bounded. There is no automatic telemetry upload. See UPDATE-NOTES.md for exact sampling and feature limits.
- There are no sample events, fabricated ratings or mocked auth screens at runtime. Empty projects display empty states.

## Domain rules

Organizer profiles and events start pending. Organizer edits require reapproval and clear verification. Event edits return to pending. Public directories only include approved, unsuspended organizers and approved events. Cancelled events remain discoverable in an all-dates search and retain cancellation labels; calendar counts exclude them.

Free events without an external URL create a confirmed registration in this platform. Events with an external URL create an **interest** record and open the organizer website. No payment gateway or external-booking confirmation is implemented or implied. Paid events must supply an external registration URL.

An organizer confirms a registrant's attendance after the non-cancelled event ends. A user may then write a 1–10 review. One database row per user/event combines the score and review text; it is normalized without a redundant ratings table. Updates reset moderation. Only approved, attendance-verified rows contribute to the public average. An organizer cannot review their own event. `OrganizerRating` centralizes public name, score, count and verification rendering. No independent opaque credibility score is invented.

Attendance is a human organizer assertion, not identity proof. Collusion and fraudulent attendance need operational moderation, appeals and, for higher assurance, ticket/check-in integrations.

## Main tables

| Entity | Purpose |
|---|---|
| auth.users | Managed authentication identities and password hashes |
| profiles, user_roles | Private display profile, suspension and server-managed administrator role |
| divisions, districts, categories | Eight divisions, 64 district names and editable event categories |
| organizers, organizer_verifications | Public organizer profile and private verification evidence |
| events | Dates, geography, contact, registration link, fee, cover and approval |
| transport_services, transport_bookings | Verified provider itineraries, capacity and account-private seat reservations |
| private.transport_verifications | MFA administrator review evidence |
| event_registrations | Interest, confirmed free registration and attendance |
| reviews | One verified event experience, score, written review and organizer response |
| saved_events | Account-private bookmarks |
| notifications, push_tokens | Private inbox and device registrations |
| reports, admin_audit_logs | Moderation reports and append-only admin actions |
| private.rate_limits | Hourly mutation counters |
| private.push_outbox, private.push_receipts | Push retry and provider receipt state |

The `auth.users` table is provided by Supabase; do not create it yourself. Organizer score views compute from review rows. No client can write an average or verified-attendance flag.

## Images

Native photo picker -> resize/re-encode JPEG -> authenticated `upload-image` Edge Function -> bounded 5 MB stream and JPEG/PNG signature checks -> private object bucket -> short-lived signed read URL. The Edge Function checks the user's identity and organizer permission and uses server credentials only for the upload. Clients have no direct storage INSERT policy. Database triggers validate image ownership and object existence before publication. Admin approval is still necessary for an event using an uploaded image.

## Notifications

Changes/reapproval/cancellation of followed events create private in-app notifications. A trigger enqueues outbox entries. The scheduled `push-dispatch` function sends generic update notices, tracks Expo ticket receipts, removes expired tokens and retries failed jobs up to five times. Delivery is at least once: a retry can duplicate a notification. An accepted ticket is not proof the OS displayed it. No recurring reminders are silently configured.

## Deliberate limits

- Optional Google sign-in is not implemented. Email/password is the implemented path.
- No ticket payment processing, automatic event scraping, identity-document uploads, geolocation tracking or account deletion flow is included.
- Event registrations remain separate from transport. Transport services have inventory-controlled reservations; free event registrations themselves are not capacity-controlled tickets.
- Admins hide inappropriate content via rejection and suspend accounts. Hard deletion and arbitrary editing of other users' content are intentionally not provided.
- Event reviews and key state changes have server controls; a production abuse programme, email delivery reputation, legal/support process and load testing still require operational work.
- Mobile layout/navigation and hosted-service end-to-end behavior require the documented device acceptance run. Do not call this release production-certified based on compilation alone.
