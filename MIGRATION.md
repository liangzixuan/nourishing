# Migration scope

Nourishing is moving from a private PC-hosted nutrition app to Appwrite Cloud. The target uses Appwrite Auth, TablesDB, Storage, Sites, and Functions. Public registration is enabled in the preview. Only the current app's data will be migrated into its owner's account.

The cloud preview now covers the diary, custom foods/recipes/meals, exercise and biometrics, targets and macro schedules, reports/charts/snapshots, reviewed repeat items, food suggestions, nutrient search, recipe URL import, Gemini photo logging, CSV export and Health Connect imports. Core calculations reuse the current app’s domain. The PC remains the full product. Cloud and PC edits are separate; neither continuously synchronizes to the other.

The earlier Nourishing project was reviewed for account lifecycle, secure sessions, password recovery, data isolation tests, deployment activation, and restore practices. Its custom PostgreSQL and Azure backend will not be carried over. The current app's nutrition rules, catalog provenance, and mobile interface remain the foundation.

Before production cutover:

- Restore text/voice logging and account-scoped offline queued edits. Barcode scanning and packaged-food search are available in the cloud preview; hosted verification is recorded below.
- Restore diary selection/copy/paste/group ordering, reusable-meal creation, note photos, CSV import, nutrition-label entry and favorites. Imported metadata is preserved, but that alone does not make these flows available.
- Restore food/recipe printouts, report-only chart editing and nutrient-contributor drill-down. Captured nutrition reports and PDF/print preview are available in the cloud preview; hosted verification is recorded below.
- Port Coach, glucose/cycle cards, pinned charts, streak image sharing, library sharing and remaining diary tools. Dashboard news/settings, nutrition, energy/weight, streaks, sleep and fasting are implemented. Existing imported records and metadata remain preserved.
- Activate and verify cloud background jobs, including scheduled fasting and automatic repeat items. The fasting worker is implemented and tested with disposable accounts but stays disabled.
- Complete Android correction recovery, automatic native export, Wear and reminders. Foreground import/export/reconciliation, explicit background-import consent, cloud widgets and report printing are implemented; full native and device checks remain.
- Complete account deletion and orphan media cleanup. Backup download, reviewed restore and verified previous-version selection are implemented; recovery deployment verification is recorded below. CSV exports are implemented. Snapshot deletion removes its reference; private Storage retention is not permanent deletion.
- Establish scheduled independent cloud backups. Retained previous versions and user-triggered downloads do not replace the PC's automatic backup flow.
- Reconcile PC changes since the baseline and repeat record, photo, and nutrient comparisons.
- Complete the emailed password-recovery check.
- Verify the Android app with the PC server stopped.

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

Still pending: phone reconciliation UI/session integration, correction recovery, automatic native exports and physical-device checks. Server support alone does not establish that the phone path works. Production `nourishing.app` and the installed Android connection remain unchanged.


## Barcode, reports and foreground Android reconciliation — November 15, 2026

Preview `6af9658a387768d8cdce` passed real provider barcode lookup/search, account-bound atomic saves and retry checks. The deployed mobile report captures the account’s selected sections and renders the original report with loaded styles under strict CSP. Hosted Health Connect checks passed again, including receipt snapshot numbers shown in recovery history. Disposable test resources were removed and the real owner workspace was unchanged.

Local validation includes 212 server/browser tests, the production build, 20 built-server boundary checks, scanner WASM decoding and report-language/unit checks. Android foreground reconciliation and the existing print bridge compile with 64 focused tests passing. No new APK was installed. Physical reconciliation, export and print-dialog checks remain before Android cutover. Source publication audit and Git checkpoint are recorded in `PROGRESS.md`.
