# Bangladesh Event Platform — RunGather

A real-backend Expo/TypeScript mobile project with Supabase PostgreSQL, authentication, event calendar, organizer reviews, organizer management and an MFA-protected administrator dashboard.

**Release status:** source implementation with automated domain/database tests and mobile bundle checks. It is not a deployed service or an installable APK/IPA, and is not certified production-ready. Read [TESTING.md](docs/TESTING.md) for precisely what ran. Live email authentication, push delivery and native UI/device behavior require configuration and acceptance testing.

## For you: start here on Windows

1. Extract this entire ZIP; keep its folders together.
2. Install a current Node.js LTS version compatible with the pinned Expo SDK (use Node 24 LTS), VS Code, and Android Studio.
3. Open this folder in VS Code. In Terminal -> New Terminal run `npm ci`.
4. Create a Supabase project. This needs your own account; no credentials are included. Check current plan limits before choosing a plan.
5. Follow [DATABASE.md](docs/DATABASE.md) to apply migrations and configure email authentication.
6. Copy `.env.example` to `.env`. Put your Supabase **project URL and public anon/publishable key** into it. Never put a service-role key in the app.
7. Open Android Studio once and install the Android SDK/emulator. Then run `npm run android` in this project. This generates the Android project, builds a development app and launches it on a connected Android device or emulator.
8. Start again with `npm start` when the development app is already installed. Your phone and laptop must be able to reach the development server.

The app deliberately displays a setup message when environment variables are absent. It does not pretend to log in, populate fake events or create fake scores.

For a source-only first check, steps 1–3 are enough to run `npm run check`. A running shared app requires the Supabase setup.

## What is included

- Android/iOS React Native source; light/dark modes; Home, Calendar, Discover, Saved and Profile tabs.
- Monthly, weekly and daily calendars; date counts, division/district/category filters, query and price filters, date/rating/popularity sorting.
- Event detail, organizer profile/directory, server-backed saves and registration history.
- Email sign-up/verification/login/reset, profile editing and secure native token storage.
- Approved organizer profiles, verification requests, event/image creation and editing, cancellation, registration/attendance lists and review responses.
- One review per attended event experience; moderation and database-derived organizer averages out of 10.
- Administrator queues for users, organizers, events, verification requests, reviews and reports; statistics, reference-data management and audit logs. MFA is enforced in PostgreSQL.
- Database migrations and RLS policies, secure image upload, in-app notifications, push dispatch/receipt worker, tests and configuration examples.

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for exact behavior and limits.

## Commands

```sh
npm ci
npm run typecheck
npm test
npm run test:database
npm run check
npm run android
npm run ios
```

`npm run ios` requires macOS and Xcode. Windows cannot run Xcode locally. Android can be built locally without buying a store account. Push notifications need a development build and platform push credentials; do not rely on Expo Go for remote push. Public store distribution has separate requirements and potential fees.

`npm run test:database` executes the actual schema, SQL functions and RLS under embedded PostgreSQL (PGlite). Test authentication claims and infrastructure tables are isolated test fixtures. No fake fixtures are included in production migrations.

## Project map

```text
App.tsx                     Native shell, bottom tabs and detail navigation
src/context.tsx             Session/catalogue state and deep links
src/supabase.ts             Supabase client and secure session storage
src/components/             Shared UI, filters, cards, OrganizerRating
src/screens/                Calendar, auth/profile, events, organizer and admin
src/domain.ts               Date, filter, calendar and rating logic
supabase/migrations/        Schema, RPCs, triggers, grants, RLS, storage and push
supabase/functions/         Authenticated uploads and private push dispatcher
supabase/config.toml        Local Supabase configuration
assets/icon.png             Original app icon
.env.example                Public app configuration template
package-lock.json           Locked dependency tree
scripts/                    Maintenance helpers
tests/                     Domain and embedded PostgreSQL checks
docs/                      Setup, deployment, security and acceptance tests
```

## Your configuration checklist

| Needed | Where it belongs |
|---|---|
| Supabase project URL | `.env`: `EXPO_PUBLIC_SUPABASE_URL` |
| Supabase public key | `.env`: `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| Database password/access token | Local Supabase CLI login/link flow only |
| Service-role key | Server Edge Function environment only; Supabase supplies it |
| Email sender/SMTP | Supabase Auth dashboard; verify sender domain as required |
| TOTP authenticator | Administrator's own device |
| Expo project ID | `.env` and `app.json` when enabling push/EAS |
| FCM/APNs credentials | Expo/platform credential configuration, never app source |
| Push dispatch random secret | Edge Function secrets and secure scheduler |
| Expo push access token, if enabled | Edge Function secret only |

No account, provider project, DNS setting, production deployment or recurring job has been created on your behalf. No payments were made. Free/local development is the intended starting route; production operating costs and service quotas must be checked before launch.

## Next documents

- [Database and email setup](docs/DATABASE.md)
- [Android/iOS builds and deployment](docs/DEPLOYMENT.md)
- [Security and backup procedures](docs/SECURITY.md)
- [Verification results and device acceptance](docs/TESTING.md)
- [Architecture and scope](docs/ARCHITECTURE.md)

## Latest update — 0.3.0

Includes server-side event search/pagination and calendar counts, English/Bangla participant UI, account-scoped offline saved-event text summaries, MFA-verified transport seat reservations, and local performance metrics. Read [UPDATE-NOTES.md](docs/UPDATE-NOTES.md) for workflows, precise limits and checks.

Apply all unapplied migrations, including `202611140006_transport.sql`, `202611150007_search.sql` and `202611150008_transport_booking.sql`. No payment gateway is included. Provider verification is performed by your administrator; no real operator was verified in this source delivery.
