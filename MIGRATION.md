# Migration scope

Nourishing is moving from a private PC-hosted nutrition app to an installable PWA on Appwrite Cloud. The user selected PWA delivery and removed Health Connect from the product on November 15, 2026. Previously imported health records remain preserved. The target uses Appwrite Auth, TablesDB, Storage, Sites, and Functions. Public registration is enabled in the preview. Only the current app's data will be migrated into its owner's account.

The cloud preview now covers the diary, custom foods/recipes/meals, exercise and biometrics, targets and macro schedules, reports/charts/snapshots, reviewed repeat items, food suggestions, nutrient search, recipe URL import, Gemini photo logging, CSV import/export, nutrition-label entry, favorites and text logging. Health Connect entry points are removed from the PWA. Core calculations reuse the current app’s domain. The PC remains the full product. Cloud and PC edits are separate; neither continuously synchronizes to the other.

The earlier Nourishing project was reviewed for account lifecycle, secure sessions, password recovery, data isolation tests, deployment activation, and restore practices. Its custom PostgreSQL and Azure backend will not be carried over. The current app's nutrition rules, catalog provenance, and mobile interface remain the foundation.

Before production cutover:

- Preview deployment `6afa4ba9214e34ae2c31` passed hosted verification of Coach, glucose/cycle cards, source chart settings and Dashboard pins, library JSON sharing and food printing. The chart calendar adapter is corrected. Hosted offline controls and account/generation isolation also passed. The source has no separate recipe-print feature.
- Complete the remaining source UI: detailed CGM controls, glucose source/timeline and cycle import controls. Offline selection and score/completeness/balance panels pass local checks and await deployment. Streak image sharing is deployed and passes hosted checks. See the feature provenance documents for exact gaps.
- Scheduled fasting and browser reminders are deployed as private Functions with hourly repair. Disposable delayed-execution checks passed. The real owner's dispatch bootstrap passed without changing workspace contents; no schedule currently requires an execution. Installed-device notification delivery remains unverified. Repeat items retain the source app's reviewed, manual logging flow.
- Notification receipt retention is deployed with the required private index. A live cleanup check removed an expired fixture receipt and preserved recent uncertain/sending receipts. Existing source limits are 90 days and 20,000 receipts per account.
- Complete installed-PWA checks. The hosted preview already passed CSV/label/favorites, offline restart/queued writes, account isolation, install assets and cache checks. Health Connect entry points and native widget links are removed; APK, Wear and native health integrations are outside the new delivery scope.
- Account deletion now removes owned rows and media across generations, including orphan media, through a durable private job. Previous versions retain the source app’s indefinite retention policy; only temporary backup reviews expire. Snapshot deletion removes its reference; private recovery retention remains in effect.
- Independent T7 backups are installed and verified: daily at 09:00 Central and after Windows sign-in, with 14 daily copies. The PC, signed-in Windows account and approved T7 must be available. A real archive and isolated restore have passed.
- Repeat final reconciliation immediately before cutover. The November 15 comparison passed: PC data matches the approved baseline, all three photo files match, and nutrition totals match for all three recorded dates. Cloud-only differences are the previously migrated health-import metadata.
- Complete the emailed password-recovery check.
- Verify the installed PWA with the PC server stopped.
- Switch nourishing.app and application callback origins after the remaining checks pass.

The preview uses a separate domain. Personal data was imported only into the confirmed owner's account and verified against the source. All 34,885 catalog rows retain normalized foods, original source JSON, and dataset provenance. No production domain switch or Android address change has been performed. No billing settings were changed.

The new diary reuses the existing mobile header, group, and record renderers. Nutrition previews and saves use the existing workspace domain code. Writes run through Appwrite transactions with revision checks and durable request receipts. Live tests cover retries, rollback, simultaneous edits, and an initially empty account. Owner data was not changed during these tests.

## Backup, profile and library migration — November 15, 2026

Preview `6af9497ab5698c4c4cdb` adds complete JSON backup download with private photos, reviewed restore, and Profile & Body settings. Restore stages a private generation, verifies its records and images, then atomically replaces the current workspace head. A concurrent diary edit rejects the restore. The old generation remains retained for recovery; automatic expiry and a recovery selector are still pending.

Hosted browser checks passed for download/restore, body equation and activity, nutrient reference selection, recorded measurements, settings reload, account isolation and unchanged migrated-owner data. The mobile navigation regression also passed: the Fasting card now fits its margins without expanding the layout viewport. Disposable accounts and their resources were removed.

Named library portions, retirement/restoration and occurrence-only diary ingredient adjustments are deployed and pass local and hosted mobile checks. The source rules preserve quantity bases, library metadata and other diary occurrences. These editors use authenticated requests with a 4 MiB body limit; ordinary commands retain the smaller limit. The hosted oversized upload returned 413 after 28.4 seconds; runtime logs show less than 0.3 seconds inside the handler. Publication text has an explicit UTF-8 check.

## Dashboard, native identity and recovery — November 15, 2026

Preview `6af9538e4a5e7241e9ac` includes the source Dashboard, account-bound home-widget endpoint and previous-version recovery. Local and hosted browser checks cover charts, settings, streak reset, custom ranges, report navigation and widget destinations through sign-in. Hosted checks exposed static home-page precedence over the server redirect; widget navigation now belongs to the static page's client entry. Android background-import and widget code passes 30 focused tests and compiles; it is not installed on the phone.

Verified previous-version recovery and Health Connect export metadata are deployed. Hosted Review and Cancel leave current data unchanged; Replace restores the selected records and exact photo bytes. The PC export namespace existed outside its workspace JSON and has now been migrated to the verified owner's account. Its source has no saved correction drafts or policies. Migration preserved all unrelated workspace data, retained the exact namespace, and passed a repeated-apply no-op check. New cloud accounts get their own stable namespace. Restore keeps lineage and correction membership history, changes the review scope, and produces identical staged data on retry. The Health Connect stage below supersedes the pending native-export endpoint status.

## Health Connect export and reconciliation — November 15, 2026

Cloud biometric and intake exports reuse the original projections, units, known nutrient values and native record identities. Review tokens bind to the authenticated account, workspace lineage and restore scope. The Android candidate supports foreground preview, confirmation and durable interrupted-write records across logout. It compiles and passes 37 focused tests; no APK was installed and no device health records were written.

The cloud reconciliation API preserves the original stream ordering, native provenance, explicit removal consent and replay receipts. A removal verifies the previous workspace and referenced photos, stages a new generation, then commits its head, recovery snapshot number and receipt together. Backup restore retains the monotonic recovery counter. Ordinary imports remain in the current generation. Shared generation and photo helpers own staging and integrity checks across reconciliation and backups.

The 194 server tests pass. Actual Appwrite checks passed for unit conversion, absent nutrients, import without implicit removal, destructive consent, immutable recovery with photos, lost-response replay, counter continuity after restore, concurrent edits and account isolation. Synthetic accounts were removed and the real owner's workspace was unchanged. Production-build checks found and fixed a competing adapter upload limit; the API now owns authenticated streaming limits and returns 413 consistently. Preview `6af95e7dd4305dedd2a5` is active. Hosted export, reconciliation, retry and account-isolation checks passed; details are in `PROGRESS.md`.

Still pending at this checkpoint: phone reconciliation UI/session integration, correction recovery, automatic native exports and physical-device checks. The later Android checkpoint below supersedes the foreground reconciliation status. Server support alone does not establish that the phone path works. Production `nourishing.app` and the installed Android connection remain unchanged.


## Barcode, reports and foreground Android reconciliation — November 15, 2026

Preview `6af9658a387768d8cdce` passed real provider barcode lookup/search, account-bound atomic saves and retry checks. The deployed mobile report captures the account’s selected sections and renders the original report with loaded styles under strict CSP. Hosted Health Connect checks passed again, including receipt snapshot numbers shown in recovery history. Disposable test resources were removed and the real owner workspace was unchanged.

Local validation includes 212 server/browser tests, the production build, 20 built-server boundary checks, scanner WASM decoding and report-language/unit checks. Android foreground reconciliation and the existing print bridge compile with 64 focused tests passing. No new APK was installed. Physical reconciliation, export and print-dialog checks remain before Android cutover. Source publication audit and Git checkpoint are recorded in `PROGRESS.md`.


## Diary selection, contributors and note photos — November 15, 2026

Preview `6af9696692007f0a68be` passed hosted checks for diary copy/retry, reusable meals, ordering, clear amounts, nutrient contributors and note-photo save/replace/remove. Mobile diary controls, current-photo access, energy-unit display and account isolation passed. All temporary resources were removed and the real owner workspace was unchanged. Local validation passed 236 tests, the production build and 27 built-server request checks. The original domain owns selection, quantities, ordering and nutrient calculations. Remaining cutover work is listed above; this release does not change the production domain or installed Android app.


## Account lifecycle and T7 recovery — November 15, 2026

Preview `6af9e66a8dd8246c822b` passed hosted registration, profile updates, login/logout, deletion and isolation checks. The private account cleanup Function is enabled on a 60-minute interval with no public execute permissions; targeted worker deletion and the empty-queue path passed. Its first automatic timer run is not yet observed. The separate fasting worker remains disabled.

A real T7 cloud archive restored 76 rows and three photos into an isolated recovery fixture. The fixture was removed and the owner workspace stayed unchanged. Daily backup installation awaits a durable read-only key. Local validation passed 285 tests, the production build and 48 built-server checks. See `PROGRESS.md` and `docs/account-lifecycle.md` for evidence and limits. The production domain and installed Android origin have not changed.

## PWA change in progress — November 15, 2026

Preview deployment `6afa3a48afec3e43fad4` contains the PWA installation assets, public-only offline screen, CSV import, favorites, nutrition-label entry, text/voice logging and browser notification controls. Health Connect HTTP operations and native widget links are removed; imported records remain intact. Local validation passed 336 tests, the production build, built-server boundary checks and real Chrome PWA checks. Hosted checks passed for installation assets, the service worker, offline/online recovery, CSV preview/import/replay, nutrition-label provenance and account isolation. Disposable fixtures were removed and the owner workspace stayed unchanged. Scheduled reminders, offline queued edits and installed-phone validation remain pending.
