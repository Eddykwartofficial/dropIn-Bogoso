> Updated scope: read PILOT-LAUNCH-GUIDE.md alongside this original setup guide. Phone auth, FCM, background location, private document storage and optional MoMo are now implemented in source. Historical cash-only/foreground-only notes below are superseded by that guide. Native/device validation remains outstanding.

# DropIn Ghana — Firebase setup guide
Follow this sequence on a development computer. The deployed browser demo already works independently.

## 1. Install the development tools
Install Flutter stable, Android Studio with Android SDK/Google Play emulator, Node.js 22, Python 3, and the Firebase CLI. iOS builds also require macOS and Xcode.
```bash
npm install -g firebase-tools
dart pub global activate flutterfire_cli
firebase login
flutter doctor
```
Use current official installation instructions:
- https://firebase.google.com/docs/flutter/setup
- https://firebase.google.com/docs/functions/manage-functions
- https://firebase.google.com/docs/app-check/flutter/default-providers

## 2. Create your Firebase project
1. In https://console.firebase.google.com create a project dedicated to DropIn.
2. Enable Cloud Firestore in production mode. Choose an appropriate location deliberately; functions use europe-west1.
3. Enable Authentication → Email/Password. Create your operator account using the Firebase console.
4. Enable the billing plan required for deployed Cloud Functions and external network calls. Set budget alerts.
5. Register **two separate Android apps** and one Firebase web app for the admin.
6. Keep live bookings disabled until the configuration and acceptance tests are complete.

The generated mobile Android application IDs are gh.dropin.dropin_passenger and gh.dropin.dropin_driver. Use these exact package IDs when registering them.

## 3. Generate the native Flutter projects
From the DropIn-Ghana repository root:
```bash
python3 scripts/bootstrap-mobile.py
cd 1-Passenger-App
flutter pub get
flutterfire configure
cd ../2-Driver-App
flutter pub get
flutterfire configure
```
Choose the same Firebase project for both apps. Choose Android, and iOS only if you are building it.

The source imports firebase_options.dart, which flutterfire configure generates. That generated file is required before flutter analyze or flutter run. Do not fabricate its values.

Download the correct Android google-services.json for each application and put it in that application's android/app directory. For iOS, use its own GoogleService-Info.plist in ios/Runner. Ensure the FlutterFire setup has configured the Google Services Gradle plugin as required by your generated Flutter/Firebase versions.

The bootstrap script preserves lib/main.dart and pubspec.yaml, adds INTERNET permission, adds foreground location permissions to Driver, sets Android minSdk 24, and adds the iOS location explanation. Use Android compile SDK 35 or higher as required by your resolved geolocator/Flutter version. If you previously generated native files, review them rather than assuming new permissions are automatically correct.

## 4. Register App Check
1. Register both apps in Firebase → App Check using Play Integrity for Android and App Attest for iOS.
2. Register the Firebase admin web app with a reCAPTCHA v3 site key; authorize its deployed hostname.
3. Debug builds use the App Check debug provider. Add each device's printed debug token in Firebase App Check.
4. Never ship debug tokens or debug providers as the release configuration.
5. Callable functions enforce App Check outside the Firebase Emulator. If a call is rejected, check the configured app ID, App Check registration and debug token.

Reference: https://firebase.google.com/docs/app-check/cloud-functions

## 5. Set up server dependencies and routing
```bash
cd 4-Backend-Functions
firebase use --add
cd functions
npm install
npm test
cd ..
firebase functions:secrets:set GOOGLE_ROUTES_KEY
```
Enable Google Routes API in the associated Google Cloud project. Enter the server API key at the secret prompt; do not put it in Dart, React, chat, .env or Git. Restrict the key to the required API and use an appropriate server-side security configuration.

Copy functions/.env.example to functions/.env.PROJECT_ID, replacing PROJECT_ID with the real project ID. Set:
- WHATSAPP_PHONE_NUMBER_ID: your Meta Cloud API phone number ID.
- META_GRAPH_VERSION: a currently supported version from Meta's own console/docs, in vNN.N format.
- BOOKING_URL: your real HTTPS passenger booking URL. The supplied AppDeploy URL is a demo, so do not present it as live service booking.

This backend does not guess road distances when routing fails. A visible error must be resolved before a live booking can be made.

## 6. Configure WhatsApp if you want the handoff bot
```bash
firebase functions:secrets:set WHATSAPP_ACCESS_TOKEN
firebase functions:secrets:set META_APP_SECRET
firebase functions:secrets:set WHATSAPP_VERIFY_TOKEN
```
Use your WhatsApp Business / Meta application credentials. After deployment, copy the webhook URL returned by Firebase, configure it in the Meta WhatsApp console with the same verification token, and subscribe to messages. GET verifies the challenge; POST verifies X-Hub-Signature-256 over the raw request body.

The bot replies only to authenticated inbound messages. It sends a booking handoff, not a ride confirmation. Replies within the customer-service window must comply with your account's Meta requirements. Configure Firestore TTL on whatsappMessages.expiresAt to remove de-duplication records. TTL configuration is not included in the supplied index file.

For reliability at scale, replace the current synchronous reply/lease mechanism with a durable delivery queue. A failure after Meta accepts a message but before the local sent marker is stored can still duplicate a reply.

## 7. Deploy functions and security rules
From 4-Backend-Functions:
```bash
firebase deploy --only firestore,storage,functions
```
Supply all declared configuration/secrets before deploying the full export set. If not deploying WhatsApp, deploy only the named ride/admin functions and rules, or remove its export and parameter module from your own app version. Do not deploy a half-configured WhatsApp webhook.

Deploy Firestore rules and composite indexes. The SDK clients cannot directly write ride, driver or ledger records; all writes go through protected functions. Storage is deny-all because document uploads are not implemented. Firebase Functions' Admin SDK bypasses rules, so review function authorization as part of acceptance.

## 8. Provision the operator
The operator account must exist in Firebase Authentication. Copy its UID. Authenticate your development computer with an authorized Google Cloud identity using Application Default Credentials, or set GOOGLE_APPLICATION_CREDENTIALS to a privately stored service-account file authorized for this project. Do not commit that file.
```bash
node scripts/set-admin.js YOUR_OPERATOR_FIREBASE_UID
```
Run this from the repository root after functions dependencies are installed. It preserves existing claims and adds admin=true to the explicitly supplied account. Sign out and sign in again so the account receives its refreshed token.

The demo Admin tab cannot grant production permissions.

## 9. Configure and run the Firebase admin panel
In 3-Admin-Panel copy .env.example to .env, then fill in your Firebase **web app** configuration. These Firebase public client identifiers are distinct from backend service-account/Meta/Routes secrets.
Set VITE_RECAPTCHA_SITE_KEY from Step 4.
```bash
cd 3-Admin-Panel
npm install
npm run dev
npm run build
```
Sign in using the provisioned operator account. Unauthorized accounts see an access-required screen; Firestore and callable admin functions independently enforce the admin claim.

The downloadable admin is separate from the public AppDeploy demo. To publish it, deploy its built dist directory to your selected static hosting and add the hostname to Firebase Authentication's authorized domains and the reCAPTCHA site configuration.

## 10. Register and verify your first driver
1. Run the Driver app, create an email account and submit the application.
2. Verify the actual licence, identity, vehicle registration, roadworthiness, insurance and inspection through your operational process.
3. In Firebase Admin approve the driver only after verification.
4. Set pilot fares in Admin. Monetary settings are integer pesewas.
5. Keep the driver app open, grant location permission, and go online when live mode is enabled.
6. The backend ignores stale location updates after two minutes. The app sends foreground updates every 45 seconds.

## 11. Test in a controlled Firebase development project
Keep your development project separate from any future production project. After routing and App Check are configured, enable live-mode code paths only in that development project:
```bash
node scripts/set-live.js true
```
Use test devices/accounts. Confirm:
- Unauthenticated users cannot call protected functions.
- Non-admin accounts cannot read all rides, approve drivers or save fares.
- A passenger sees only their rides; a driver sees only assigned rides/profile/ledger.
- A requested ride finds an approved, online, fresh-location driver of the matching type/city.
- Two concurrent passengers cannot reserve the same driver; one passenger cannot hold two active rides.
- Retrying requestRide with the same requestId returns the existing ride.
- Driver accepts → arrives → starts → completes in order.
- Passenger can cancel only before the trip starts.
- Completed cash rides produce one ledger record even when the trigger is retried.
- Ratings require the owner, completion and a value 1–5.
- Failed routing produces an error rather than a fabricated price.
- A searching/offered ride that times out is cancelled and releases locks.
- A driver cannot change availability or approval while assigned a ride.
- WhatsApp invalid signatures are rejected; valid messages get the handoff reply.
- App Check works on actual release devices, not just debug devices.

To run emulators:
```bash
cd 4-Backend-Functions
firebase emulators:start --project demo-dropin
```
Use Flutter with:
```bash
flutter run --dart-define=USE_EMULATORS=true --dart-define=EMULATOR_HOST=10.0.2.2
```
Android Emulator uses 10.0.2.2 for the host; physical devices/iOS need the appropriate reachable host address. Native Firebase config still must exist.

The emulator is for rules/auth/function tests. The supplied getQuote/requestRide still require a Routes API secret and config/operations.liveEnabled=true in the emulator; there is no hidden fake-route fallback. Seed that config in the emulator UI and configure emulator secrets locally as described by Firebase. Production secret enforcement is not exercised by pure Node unit tests.

## 12. Build your mobile app
After configuration, run in each mobile app:
```bash
flutter analyze
flutter test
flutter run
flutter build apk --release
```
flutter test currently has no supplied Flutter widget suite; add device/widget tests after Firebase setup. The meaningful provided automated tests are Node business-rule tests. Release signing must be configured with your own Android key. Google Play distributes a signed app bundle, built with flutter build appbundle --release. iOS signing requires your Apple developer identity.

## 13. Enable actual service only after acceptance
The live switch is an explicit operator decision:
```bash
node scripts/set-live.js true
```
To stop new live bookings:
```bash
node scripts/set-live.js false
```
Stopping new bookings does not block already-assigned trips from completion/cancellation.

Before an actual launch, complete release-device, concurrency and rules testing, publish real terms/privacy/support information, establish driver support, and provide your real business contact number. No actual launch was performed in this delivery.

## Changing service locations
Update all matching datasets:
- shared/places.json (human-maintained master).
- 4-Backend-Functions/functions/places.json (deployed function copy).
- 1-Passenger-App/lib/places.dart and 2-Driver-App/lib/places.dart.
- 6-Web-Pilot/shared/domain.ts if also changing the independent demo.

Changing city/type values requires matching driver profiles. A small preset-location pilot is the current implementation; arbitrary address search is a future extension.
