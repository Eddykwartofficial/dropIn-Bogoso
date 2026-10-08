# Configure and test the real DropIn pilot

## 1. Set up your own development project
Follow FIREBASE-SETUP-GUIDE.md for SDK installation and Firebase registration. Use a development project first. The Android IDs are gh.dropin.dropin_passenger and gh.dropin.dropin_driver.

From the repository root, run:
```bash
python3 scripts/bootstrap-mobile.py
```
Then run `flutterfire configure` and `flutter pub get` in each mobile folder. Register both iOS apps too. The generated Firebase options, Google services files and signed native projects must belong to your own project.

## 2. Authentication, location and push
Enable Phone and Email/Password providers in Firebase Auth. Add Ghana to your SMS region policy and use Firebase test numbers during development. Register Android SHA-1 and SHA-256 fingerprints, including the eventual Play signing certificate. On iOS, configure Firebase phone-auth APNs/reCAPTCHA requirements and URL schemes.

For each iOS target, enable Push Notifications and Background Modes for Remote notifications in Xcode; enable Location updates for Driver. Upload the APNs authentication key in Firebase Cloud Messaging. The scaffold script adds native location descriptions and background modes but cannot provision your Apple signing profile or entitlements.

Android: allow notification permission and choose All the time for driver location in Settings. iOS: choose Always. Explain to drivers that Going online shares background location and Going offline stops it. Test permission denial and revocation.

Configure Firebase App Check for both apps and the admin web app. Configure debug tokens only in development. Auth and App Check are required for callable operations.

## 3. Driver document storage
Configure Firebase Storage, deploy its rules and accept the cross-service Storage-to-Firestore rules permission prompt. Set `VITE_FIREBASE_STORAGE_BUCKET` in the admin .env. Storage bucket naming must match the Firebase console; do not assume an appspot.com suffix.

The browser admin uses authenticated blob downloads rather than public download tokens. Configure bucket CORS for the exact admin origin, GET requests and Content-Type response headers, using your Google Cloud bucket tools. Do not make the bucket public. Example CORS file:
```json
[{"origin":["https://YOUR-ADMIN-HOST"],"method":["GET"],"responseHeader":["Content-Type"],"maxAgeSeconds":3600}]
```
Document authenticity and expiry dates remain manual review tasks. Upload four files, open each in Admin, verify the driver/vehicle, then approve. Missing documents prevent approval. Replacement evidence uses a new immutable object; old evidence is retained.

## 4. Backend and optional MoMo
Install backend packages, set Google Routes and existing WhatsApp secrets as described in the original guide. Set the additional payment secret through the Firebase CLI:
```bash
cd 4-Backend-Functions
firebase functions:secrets:set PAYSTACK_SECRET_KEY
firebase deploy --only firestore,storage,functions
```
Use your Paystack test key first. Do not put any secret in Dart, React or chat. Configure the Paystack webhook to the deployed `paystackWebhook` HTTPS endpoint shown by Firebase. Enable GHS and the mobile_money channel on your merchant account. Use the merchant dashboard to verify transactions.

After provider test setup, enable MoMo in the development project:
```bash
node scripts/set-momo.js true
```
Use application-default credentials for the correct Firebase project. This switch does not configure the provider or prove payment readiness. Disable again with `false` if needed.

MoMo is post-trip collection: passenger chooses MoMo at booking, completes the ride, opens Pay with MoMo, supplies a receipt email and authorises the provider checkout. Returning to the app does not mark paid. The signed webhook or Check payment status must verify the recorded reference, exact amount, success status and GHS currency. There is one reference per ride. If checkout initialization is interrupted or the provider rejects a duplicate reference, check the merchant dashboard and contact the operator; do not pay via a second ad hoc reference.

Cash: complete the trip, receive the full fare, then use Confirm cash collected. Earnings include recorded but potentially unpaid fares. Operator payouts and reconciliation are manual.

## 5. Build and device acceptance
Run `flutter analyze` in each app after configuration, fix any platform/plugin issues and run:
```bash
flutter build apk --debug
```
Use a Mac/Xcode for iOS builds. Run the following on at least one Android and one iPhone, with separate passenger/driver accounts:

| Test | Required result |
| --- | --- |
| Invalid/expired SMS code and valid code | Visible failure, retry, then authenticated home |
| Notification permission denied | Ride stream still usable; no false promise of push |
| Upload missing documents, then all four | Approval blocked first, operator can view all four, then approve |
| Driver online, screen locked for 5 minutes | Position stays fresh; verify while stationary and moving |
| App force-close / revoke location | Stale driver excluded; recovery and fresh position before new offers |
| Driver receives and declines offer | Another eligible driver receives offer; same driver excluded |
| Offer not answered | Retry after scheduler runs; no driver/passenger active lock remains after timeout |
| Two passenger booking requests concurrently | One active ride, stable idempotency result |
| Competing drivers accept / cross-account operations | Only assigned driver can advance; other account denied |
| Passenger cancel and driver progress | Valid states only; both active locks cleared on terminal states |
| Forged webhook / wrong GHS amount / pending payment | Payment remains unpaid |
| Successful MoMo webhook, replay, then manual verify | One paid ride and one ledger settlement |
| Cash completed then collected | cash_due first, cash_collected only after driver confirmation |
| Offline/online, token refresh and shared-phone sign-out | No cached phantom ride or prior-account notification |

Also run Firebase Emulator rule and transaction integration tests in your development project before live deployment. Unit tests do not replace these checks.

## 6. Enable a controlled real pilot
Only after the configured backend, provider tests, rules and devices pass:
```bash
node scripts/set-live.js true
```
Begin with your verified test fleet. Register store accounts and build signed Android app bundles and iOS archives with your own keys. Handle licensing, fare policy, customer support, insurance, privacy notices and payment reconciliation before accepting the public. Nothing in the web demo changes this switch.

## Install the demonstration
Android: browser menu → Install app / Add to Home screen. iPhone: Safari → Share → Add to Home Screen. It requires a connection for demo operations. Offline shows a reconnect screen. The installed demo has no real ride dispatch or payment collection.
