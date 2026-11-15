# Build and deployment guide

## Android on your Windows laptop

1. Install Node 24 LTS and Android Studio.
2. Complete Android Studio setup, install an emulator/system image and the SDK/Java tooling required by the pinned React Native/Expo version. Use `npx expo-doctor` to inspect your environment.
3. Set up the database and `.env` as described in DATABASE.md.
4. Run `npm ci`, then `npm run check`.
5. Connect an Android device with USB debugging enabled, or start an emulator.
6. Run `npm run android`. Expo generates `android/`, compiles the development app and installs it. Subsequent UI development uses `npm start`.

After native generation, a local debug APK can be built in Windows:

```powershell
cd android
.\gradlew.bat assembleDebug
```

Output is normally `android/app/build/outputs/apk/debug/app-debug.apk`. A debug/development app may depend on Metro; it is not a standalone presentation build.

For a standalone release/demo build, configure signing in the generated Android project and use Android Studio -> Generate Signed Bundle / APK. Review the generated Gradle release signing configuration; do not distribute a debug-signed release publicly. Store the keystore and passwords privately with backups, outside source control. Use the generated project's Gradle release task after signing is configured. The release embeds the JavaScript bundle.

Optional EAS route after your own Expo project setup:

```sh
npx eas-cli login
npx eas-cli init
npx eas-cli build --platform android --profile preview
```

`preview` requests an APK. EAS service availability, plan limits and queue times are external conditions; no paid plan or cloud build has been purchased/configured in this delivery. For zero spending, use your local Android tooling first. The packaged source itself is not an APK.

## iOS

Native iOS source is generated with Expo prebuild. Local building requires macOS and Xcode:

```sh
npm ci
npm run ios
```

A Windows laptop cannot run Xcode. EAS can be considered for cloud builds with your own account and Apple's required credentials, but do not assume that distribution or signing is free. Simulator, device installation, TestFlight and App Store workflows have different account/signing requirements. Review them when you decide to launch. No iOS signing identity is included.

## Production configuration

- Replace application identifiers `com.rungather.bangladesh` with identifiers you control before registering store applications.
- Confirm the app name and icon. The supplied icon is original project artwork.
- Set real Supabase public configuration in the build environment. Only `EXPO_PUBLIC_*` values are bundled; never use that prefix for a secret.
- Configure Auth redirect URLs, SMTP and administrator MFA.
- Deploy all migrations and `upload-image` before inviting organizers.
- Add real approved listings; do not seed production with test fixtures.
- Provide a support contact, privacy policy, content moderation/appeals process and account deletion mechanism before public store submission. The source does not yet contain an account-deletion workflow.
- Complete native accessibility, keyboard, offline/network recovery, device and security acceptance testing.

## Push notifications

In-app notifications work through the database without Expo push configuration. Remote push needs additional setup:

1. Create/link an Expo project (`eas init`) and set its project ID in `app.json` and `EXPO_PUBLIC_EAS_PROJECT_ID`.
2. Configure Android FCM v1 / iOS APNs credentials through Expo's documented credential flow. Never commit service-account or signing files.
3. Build a native development or standalone app; remote push must not be assumed available in Expo Go.
4. Create a random dispatch secret with at least 32 characters, e.g. locally using Node's `crypto.randomBytes(32).toString('hex')`.
5. Set `PUSH_DISPATCH_SECRET` in Supabase Edge Function secrets. Optionally set `EXPO_ACCESS_TOKEN` if Expo push access-token security is enabled.
6. Deploy `push-dispatch` using `supabase functions deploy push-dispatch`.
7. Configure your own secure scheduler to POST to `https://YOUR_PROJECT.supabase.co/functions/v1/push-dispatch` every 5 minutes with header `X-Dispatch-Secret: YOUR_SECRET`. Keep the secret in the scheduler's secret store. No schedule was created by this project delivery.
8. In the app, sign in -> Profile -> Enable event push notifications.
9. Save/register for an event, then have its organizer/admin change/reapprove or cancel it. Verify the in-app update, provider tickets, receipt processing and actual phone delivery separately.

Outbox claims expire after ten minutes and retry at most five times. Tickets are checked after fifteen minutes. Failed/dead jobs need monitoring. Delivery is at least once and may duplicate after failures. The provider/OS can delay or suppress display. Push text deliberately contains no private registration or review data.

## Operational monitoring

Inspect provider logs and `private.push_outbox` for exhausted retries. Restrict SQL/log access. Keep secrets out of client logs and crash reporting. Test backups and document an incident response and rollback process. Inspect quota usage: database, storage, SMTP and push services can have free-tier limits.

Official references:
- https://docs.expo.dev/develop/development-builds/introduction/
- https://docs.expo.dev/build-reference/local-builds/
- https://docs.expo.dev/push-notifications/push-notifications-setup/
- https://supabase.com/docs/guides/functions
