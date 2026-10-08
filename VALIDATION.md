# Validation — 8 October 2026

## Verified in this update
- Eight Firebase business-rule tests: fares, eligible-driver filtering, trip progression authorization, cancellation boundaries, settlement arithmetic, webhook signature validation, payment amount/reference/currency/status verification and rejection of invalid/future GPS freshness.
- Five unchanged web-domain tests pass.
- All 23 Firebase exports load with installed Firebase Admin/Functions libraries; backend JavaScript parses.
- React/Firebase admin production build succeeds, including document viewing and approval gating. Bundle size warning remains (about 741 kB before gzip).
- Python scaffold helper compiles.
- Updated AppDeploy deployment reports ready with empty frontend/backend error logs and no frontend/network QA errors.
- PWA source contains manifest, 192/512 px PNG icons, service worker, installation guidance and offline fallback. The worker caches only the generic offline page, not operations or user data.

## Not verified
- No Flutter SDK is available here. Neither mobile app was analyzed, compiled or tested on a device. No APK, Android bundle or IPA is included.
- No Firebase project was supplied or deployed. No real Google Routes request, Auth SMS, App Check, FCM/APNs delivery, authenticated Storage/CORS operation or transaction/rule emulator integration was tested.
- Paystack code was tested at signature and verification business-rule boundaries only. No merchant credentials or provider payment was used. Provider initialization retries, reconciliation, refund handling and real MoMo acceptance still require operator tests.
- Native PWA installation and offline behavior on physical Android/iPhone devices were not tested. AppDeploy QA snapshots do not prove OS installation eligibility.
- AppDeploy did not provide a structured automated end-to-end test execution result. The five browser scenario definitions are included; do not treat them as an automated test pass claim.
- No concurrent fleet load, background stationary/moving location, force-close, battery restrictions or shared-phone notification acceptance test was performed.

## Runtime
Firebase target is Node 22; this environment used Node 24.19.0 and npm reported an engine-version warning. Dependency lockfiles are retained. Mobile package versions match the existing Firebase 3/5/12/15 package family; resolve and analyze on your installed Flutter SDK before release.

Historical demo checks from the previous archive are not a device validation of these new mobile features. PILOT-LAUNCH-GUIDE.md lists the configuration and real-device acceptance sequence.
