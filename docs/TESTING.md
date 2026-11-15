# Test results and acceptance plan

## Checks completed for this delivery

| Check | Result | Scope |
|---|---|---|
| TypeScript strict check | Passed | App, shared logic and test code |
| Domain, upload and improvement tests | 13 passed | Bangladesh timezone, leap years, month/week boundaries, date validation, all divisions, filters/sorts, no fake scores, secure-link validation, byte-stream limits and image signatures |
| PostgreSQL integration scenarios | 21 passed | Actual migrations, RLS, grants, constraints, triggers and RPCs in PGlite |
| Android JavaScript/Hermes export | Passed | Bundle compilation; not APK installation |
| iOS JavaScript/Hermes export | Passed | Bundle compilation; not Xcode build or signing |
| Expo fingerprint generation | Passed | Build-tool compatibility with the security override |
| npm dependency audit | Zero known advisories at delivery | Advisory snapshot, not proof of vulnerability absence |
| Native device/UI acceptance | Not run | Requires device/emulator and configured backend |
| Hosted Auth/email/HTTP/push integration | Not run | Requires the user's provider accounts and configuration |

Run the automated checks:

```sh
npm ci
npm run check
npx expo export --platform android --platform ios --output-dir dist
npm audit
```

The lockfile is included. A scoped `@expo/fingerprint -> minimatch 11.0.1` override removes the reported glob-pattern amplification advisory affecting its previous dependency. Fingerprint generation and mobile exports were checked with this override. Review compatibility when upgrading Expo; do not apply blind `npm audit fix --force` downgrades. React/React Native/native module versions follow the installed Expo SDK 58 compatibility map.

## What the database tests prove

They create an isolated, in-memory PostgreSQL database and execute **all production migrations**. Roles, JWT claim getters and the minimal Auth/Storage infrastructure are test stubs. PostgreSQL itself enforces the policies, privileges, constraints, security-definer functions and triggers.

The original core scenarios check:

1. Eight divisions, 64 districts and no fabricated events/ratings.
2. Private profiles, denied role escalation and denied unauthenticated writes.
3. Pending organizer visibility and administrator MFA enforcement.
4. Event approval, cross-owner edit denial and geography constraints.
5. Private saves/registration records and IDOR protection.
6. Attendance/completion prerequisites and direct-review spoofing denial.
7. Attendance confirmation, moderation and computed organizer averages.
8. Review updates, uniqueness, moderation reset and score bounds.
9. Organizer response ownership, private reports and audit access.
10. Private notifications, immutable content and worker RPC privileges.
11. Suspensions, blocked writes and hidden organizer events.
12. Cross-owner image-path rejection and upload-rate limits.
13. Private image reads versus approved published references.
14. Private verification requests, pending uniqueness and admin approval.
15. Profile edits clearing verification and hiding public listings until reapproval.
16. Reference-data updates requiring MFA administrator authority.
17. Private push devices, no direct inserts, token validation and reassignment.

They do **not** start the real Supabase HTTP gateway, Auth email service, Expo runtime, object-storage binary service or push provider. The upload unit tests execute the real shared byte/signature guard; they do not prove full image decoding or malware detection.

## Required hosted/device acceptance matrix

Prepare a staging project, two ordinary users (A/B), two organizers (O1/O2), and an administrator. Use real test emails and only events clearly named as staging tests. Never promote these fixtures into the production catalogue.

| Flow | Procedure and expected outcome |
|---|---|
| Navigation | Open all five tabs, event and organizer details, then back. Android hardware back closes the view stack; switching tabs resets it. No dead ends. |
| Visual/accessibility | Check small phone, large phone/tablet, light/dark, larger text, keyboard fields, screen-reader labels, long names, offline/error states and image-loading failures. |
| Sign-up | Sign up, verify email on the originating device and sign in. Unverified access follows hosted Auth policy. |
| Login/logout | Wrong password fails; valid login succeeds; logout clears the session and unregisters this device's push token. Switch A to B and verify no private data remains visible. |
| Recovery | Request reset email, open native deep link on the same device, choose a new password, then sign in with it. Old credentials fail. |
| Ownership | A cannot read B's profile, saves, notifications or registration history using direct API requests. |
| Organizer | Submit profile; public reads remain empty until approval. Editing returns to pending and clears verified status. |
| Events | O1 creates/edits an event; O2 cannot edit or approve it. Admin approves it and the calendar updates after refresh. |
| Calendar | Create fixtures across all eight divisions and multiple dates; check counts, district/category filters, month/week/day, Bangladesh midnight and cancellation exclusion. |
| Registration | Free internal event creates registered status. External/paid event opens HTTPS and records interest only. Closing/deadline/cancelled conditions are enforced. |
| Attendance/reviews | Before completion, attendance/reviews fail. After O1 confirms attendance, A submits review; public score appears only after approval. A's edit replaces the same row and returns it to moderation. |
| Ratings consistency | Compare the centralized organizer rating in cards, calendar, search, details, profiles, registration history and directories. No reviews displays Not yet rated. |
| Admin | Ordinary user and AAL1 admin fail direct moderation RPCs. AAL2 admin succeeds. Audit records appear and cannot be edited by client requests. |
| Reports | Report a review/event/organizer; only reporter/admin can read private report data. Admin can dismiss or resolve it and separately hide/suspend the target. |
| Image uploads | Anonymous/non-organizer, cross-owner paths, oversized streams and non-PNG/JPEG bytes fail. Approved covers become readable; unattached private objects stay private. |
| Notifications | Follow an event, change/reapprove or cancel it, observe private inbox entry. Run worker; check tickets, receipts, expired-token cleanup and actual Android/iOS display. |
| Resilience | Toggle network during saves/forms, retry safely, reopen the app, refresh expired sessions and test permissions denied by the OS. |
| Backup | Restore a staging backup and image exports; rerun access, file retrieval and review tests. |

Record device/OS, build identifier, staging project, expected/observed result and failures. Do not mark these as passed merely because source code or bundles exist.

## 0.3.0 additional automated coverage

Tests execute the new migrations and check server page bounds/null rejection, stable sort ties, pending-event RLS, saved-list isolation, Bengali full-text matching and calendar window counts. Transport checks include provider-edit ownership, pending invisibility, MFA/evidence requirements, seat exhaustion, idempotent total-seat replacement, private manifests, revoked direct writes, cancellation notifications and itinerary reapproval invalidation. Unit tests cover translations/fallback, sanitized bounded percentile metrics, offline expiry/corruption/account isolation, interrupted writes and Unicode chunk boundaries.

## 0.3.0 required staging/device acceptance

1. Create a future approved staging event and one transport service with capacity 1. Independently verify it using an AAL2 administrator session and documented evidence.
2. From two different signed-in devices or separate hosted HTTP clients, send one-seat reservation requests at the same time. Exactly one must succeed; total reserved seats must remain 1. Repeat with cancellation/rebooking and a network retry. Embedded PostgreSQL tests cover sequential capacity enforcement, not simultaneous hosted connections.
3. Verify user A cannot fetch user B's booking or verification evidence through REST/RPC. Verify organizer O2 cannot edit or inspect O1's manifest. Test suspended owners and revoked services.
4. Cancel, reschedule or edit the event and confirm verification resets, reservations cancel and notifications appear. Confirm push only after configuring the existing worker. Verify no payment is collected by RunGather.
5. Search enough events for multiple pages; rapidly change filters/account and ensure old results never appear under the new selection. Check calendar counts across Bangladesh midnight/month boundaries.
6. Toggle English/Bangla, restart and test text scaling/screen readers on small Android and iOS screens. Management/error strings with English fallback are documented.
7. Save events online, open Saved offline, disable networking, kill/reopen the app with its existing session and expand the text summaries. Check timestamps, the seven-day TTL, account switching, sign-out clearing, corrupt/low-storage behavior and that no booking queues offline.
8. On a slow connection/device, inspect local p50/p95/API failures and search completion; verify sharing/clearing is user controlled. Benchmark the hosted query plans with realistic catalogue sizes; source compilation is not a latency measurement.
