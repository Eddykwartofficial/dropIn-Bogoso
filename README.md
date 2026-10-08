# DropIn Ghana

## Netlify web app (dropinride.netlify.app)
The web app in `src/` and `netlify/` is a working ride-hailing service on Netlify:
riders book and track trips, drivers apply, upload documents and take trips, and operators
review drivers, set fares and watch rides.

- Sign-in: Netlify Identity (email and password).
- Data: Netlify Database (`db/schema.ts`, migrations in `netlify/database/migrations`). Driver documents are stored privately in Netlify Blobs.
- API: `netlify/functions/api.mts` (all `/api/*` routes). `dispatch-sweep.mts` runs every minute to expire offers and re-dispatch waiting rides.

### Operator setup
1. Make yourself an operator: in the Netlify dashboard open **Identity**, select your user and add the `admin` role
   (or set the `ADMIN_EMAILS` environment variable to a comma-separated list of operator emails).
2. Optional `GOOGLE_MAPS_API_KEY` (Places, Geocoding and Routes APIs) for Google address search and traffic-aware fares.
   Without it, address search uses OpenStreetMap and fares use a straight-line estimate.
3. Optional mobile money: set `PAYSTACK_SECRET_KEY`, point the Paystack webhook to `https://<your-site>/api/paystack/webhook`,
   then enable "Offer mobile money" in Operations.

---

## Expanded pilot source (Firebase/Flutter)

The installable web demonstration is live at https://dropin-ghana-ybijad.v2.appdeploy.ai/.
It is separate from the real Firebase/Flutter service. Installing it does not enable real dispatch.

## Implemented in this update
- Flutter passenger and driver: Ghana phone/SMS sign-in alongside existing email/password sign-in.
- FCM device registration, foreground ride updates and background notification handler; authenticated token removal on sign-out.
- Driver location stream with Android foreground notification and iOS background location settings. Native permission configuration is added by the scaffold script. Drivers must grant Always/All the time location permission before going online.
- Private, immutable licence, identity, insurance and roadworthiness uploads (JPEG/PNG/PDF, up to 5 MB each). Operator admin opens authenticated documents and cannot approve until all four are attached.
- Drivers can decline pending offers; dispatch excludes previously declined drivers. The scheduler retries unanswered offers and cancels unassigned requests after five minutes.
- Optional Ghana MoMo hosted checkout through Paystack, signed webhook verification, server-side status/reference/GHS amount verification, one payment reference per ride and idempotent ledger update.
- Cash collection confirmation by the assigned driver, separately from trip completion.
- Installable web demo: manifest, 192/512 px icons, installation help and a safe offline page. No API operation is cached or replayed.

## What you must configure
Read FIREBASE-SETUP-GUIDE.md and PILOT-LAUNCH-GUIDE.md. Provide your own Firebase project, billing, Android/iOS registration, Firebase client configuration, Google Routes secret, Firebase App Check, phone auth, APNs and Paystack merchant configuration. No production credentials are included.

AppDeploy hosts only 6-Web-Pilot. It does not compile Flutter, configure your Firebase project, publish to mobile stores or connect the web demo to the mobile backend.

## Validation
See VALIDATION.md. Eight Firebase business-rule tests and five existing demo domain tests pass. Admin production build passes and the 23 backend exports load. Flutter/Dart analysis, native builds, emulator transaction/rule testing, provider end-to-end tests and physical-device tests have not been performed. This archive is implementation source, not a certified production release or an APK/IPA.

## Run the tests
```bash
node --test 4-Backend-Functions/functions/test/*.test.js
node --test 6-Web-Pilot/tests/domain.test.mjs
```
Firebase production targets Node 22. The supplied demo TypeScript domain test uses Node 24.

## Remaining operational limits
- Only preset places in Accra, Kumasi, Tamale and Tarkwa are supported; no arbitrary map pins or address search.
- Dispatch considers up to 50 matching driver records and needs spatial indexing before a large fleet.
- Android/iOS may stop tracking when force-closed or restricted by battery settings. Drivers with stale positions cannot receive new assignments. Device testing is required for screen lock, stationary GPS and loss of connectivity.
- Notifications are best effort and triggers can deliver duplicates. The Firestore ride status remains authoritative.
- Uploaded documents require human verification, renewal/expiry review and an operator retention policy. No automatic identity check is claimed.
- MoMo is operator-controlled and disabled until configured. Unpaid completed MoMo fares require operator follow-up. Refunds, provider reconciliation and driver disbursements remain operator processes.
- Earnings show the recent ledger window, including outstanding fares; they do not prove payout.
- Sign-out requires connectivity to remove the device push token. A phone sign-in and an email sign-in can create separate Firebase accounts; account linking is not included.
- WhatsApp remains a signed app-handoff integration, not independent booking.
- Emergency dispatch, regulatory approval, store review and a full operating service are not supplied by this source archive.
