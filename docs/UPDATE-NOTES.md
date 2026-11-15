# RunGather 0.3.0 — search, Bangla, offline saves and transport booking

## Install / upgrade

1. Extract the ZIP and run `npm ci` with Node 24 LTS.
2. Keep your existing private `.env`, or copy `.env.example` and configure the Supabase project URL and public key. Never put server secrets in the app.
3. Apply **all unapplied migrations in filename order** to your dedicated RunGather database. The first update added `202611140006_transport.sql`. This release adds `202611150007_search.sql` and `202611150008_transport_booking.sql`.
4. For the existing Supabase CLI workflow, use `supabase link --project-ref YOUR_PROJECT_REF` and `supabase db push`. Take a backup and test against staging before upgrading production. Do not reset an existing production database.
5. Run `npm run check`, then `npm run android` or `npm run ios` on a configured development machine. Restart the app after applying migrations.

No live Supabase project was modified, no providers were contacted and no payment service was connected when preparing this ZIP.

## What changed

### Server-side search and pagination

Home, Discover, Saved and organizer event lists request one page of 20 events through `search_events`. Filtering, sorting and saved-account membership run in PostgreSQL under the caller's RLS. Next/Previous replace the current page rather than accumulating the full catalogue. Search input is debounced 250 ms; superseded requests are cancelled and responses from a previous filter/account are discarded. Event and organizer details load on demand. The Discover organizer directory is also paged.

The calendar requests daily aggregate counts for its visible month/week/day window (at most 43 inclusive days), plus a page of selected-day events. PostgreSQL uses full-text and date/filter indexes. Search matches complete words in event text (English and Bangla with the `simple` dictionary), organizer/place/category substrings, and ISO dates. It does not translate organizer-authored event descriptions or treat arbitrary event-name fragments as fuzzy matches.

RPC pages are capped at 50 rows, app pages use 20, and offsets are capped at 10,000. Date/rating/popularity sorts have a stable timestamp/ID tie-breaker. Live catalogue changes between requests can move entries across offset pages; this is not snapshot pagination. Admin/organizer management lists retain some original full-list reads. National-scale deployments should benchmark query plans and use keyset pagination or indexed summary tables where needed.

### English / বাংলা

Use the language button in the top bar. The choice persists on the device. Participant navigation, event filters, common account controls, event/transport labels, price/rating formats and major date displays support Bangla. User-authored names/descriptions remain as entered. Unknown strings fall back to English. Administrator and organizer management instructions, some backend error/confirmation messages, and district names without a dictionary entry remain English. These are a translation foundation, not a claim that every administrative string is localized.

### Offline saved events

After signing in and synchronizing, Saved includes a separate **Saved offline** section. It keeps up to the latest 20 visible saved-event text summaries, within a 64,000-character payload budget, for seven days. Large descriptions and transport notes are shortened. Images, tokens, registration records, passenger records and payment information are not copied. The cache uses account-scoped, chunked native SecureStore storage; writes commit only after all new chunks exist. Unicode code points are preserved across chunks.

Copies show the sync time and a stale-information notice. You can expand them without fetching live details. Booking, registration, saving and seat availability always use the live backend; no mutations are queued offline. Expired/corrupt/cross-account copies are rejected. Sign-out/account changes clear the previous account's copy. Offline reading requires an existing signed-in session on that device; it does not provide offline login. Clear offline copy removes the local copy; a later successful refresh can create it again.

### Administrator-verified transport and seat reservations

The previous organizer-entered transport text is retained as general information. Actual reservable inventory is a separate workflow:

1. Organizer dashboard → an event → **Manage transport seats**. Enter one service for that event: provider, public contact, pickup/route, departure/return, booking deadline, capacity and BDT fare per seat. Use Bangladesh local date/time inputs.
2. An MFA-authenticated administrator opens **Verify transport services**, checks the operator, route, timetable, capacity and fare independently, records at least 20 characters of private evidence, and approves. There is no automatic provider verification or external operator API.
3. The event detail page displays the verified service and live available seats. Active signed-in users can reserve a total of 1–4 seats per service. Repeating a request replaces that user's total; it does not add duplicate bookings. Service-row locking and authoritative seat counts prevent allocation above capacity.
4. Profile → **Transport reservations** lists the user's reservations and allows cancellation. Organizers can see a paginated manifest of participant IDs and seat counts; unrelated users cannot read passenger records. IDs are the current check-in reference; QR tickets are not included.
5. A booked itinerary cannot be edited until the organizer cancels the service. Cancellation/revocation, event schedule/location/approval changes, or organizer visibility/suspension changes invalidate verification and cancel affected reservations with an in-app notice. Push delivery uses the existing configured worker. Reinstating a service requires verification again.

A reservation is a seat allocation **without payment processing**. Provider payments/refunds happen outside RunGather and must be confirmed directly. No fare payment receipt, provider contract, seat-number selection, refund automation, or temporary payment hold is implied. Confirm travel details with the operator before departure.

### Performance monitoring

Profile contains **Performance on this device**. It records local session timings for API categories, search completion and JavaScript data readiness. A rolling maximum of 100 samples per category reports p50, p95, sample count and failures. API fetch measurements run until response headers or failure; search measurements include parsing the response. Startup is JavaScript/data readiness, not full native cold-start time.

No raw URL, token, user ID, request body or exception content is recorded. There is no telemetry upload service. Refresh/clear are local; Share performance summary opens the native share sheet only when the user selects it. This provides measurements on real devices rather than an invented speed guarantee.

### Retained first-update improvements

Runner loading animation with reduced-motion support, busy buttons, 20-second API timeout/caller cancellation, bounded signed-image URL cache, five-minute reference-data cache, exact authentication deep-link routes, secure session storage, transport URL validation and event registration response guards remain included.

## Verification for this ZIP

- TypeScript strict check.
- 13 unit tests: existing domain/image checks plus translations, bounded/sanitized metrics, offline corruption/expiry/account isolation, interrupted writes and Unicode boundaries.
- 21 embedded PostgreSQL scenarios: actual migrations, RLS/grants/RPCs; search page boundaries/Bangla matching; transport validation/MFA/ownership; duplicate reservations/capacity/cancellation/notifications.
- Android and iOS JavaScript/Hermes exports. These are bundle checks, not signed APK/IPA builds.
- Fresh dependency audit saved in `docs/DEPENDENCY-AUDIT.json`.

Not performed: physical-device/native UI acceptance, hosted Auth/Storage/HTTP/push integration, multi-connection booking load tests, production latency benchmarks or real provider verification. Follow `docs/TESTING.md` before public launch.

## Useful next steps

- Run the documented two-user concurrent booking test in staging and benchmark slow mobile connections/low-end Android devices.
- Complete professional Bangla review and remaining management/error/district translations.
- Add QR transport check-in and verified provider agreements/support/refund processes before integrating payments.
- Add an opt-in crash-reporting backend if required; this release deliberately keeps diagnostics local.
