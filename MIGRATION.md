# Migration scope

Nourishing is moving from a private PC-hosted nutrition app to Appwrite Cloud. The target uses Appwrite Auth, TablesDB, Storage, Sites, and Functions. Public registration is enabled in the preview. Only the current app's data will be migrated into its owner's account.

The cloud preview now covers the diary, custom foods/recipes/meals, exercise and biometrics, targets and macro schedules, reports/charts/snapshots, reviewed repeat items, food suggestions, nutrient search, recipe URL import, Gemini photo logging, CSV export and Health Connect imports. Core calculations reuse the current app’s domain. The PC remains the full product. Cloud and PC edits are separate; neither continuously synchronizes to the other.

The earlier Nourishing project was reviewed for account lifecycle, secure sessions, password recovery, data isolation tests, deployment activation, and restore practices. Its custom PostgreSQL and Azure backend will not be carried over. The current app's nutrition rules, catalog provenance, and mobile interface remain the foundation.

Before production cutover:

- Port the remaining Discover widgets, Coach, news/settings, library sharing and remaining diary tools. Existing imported records and metadata remain preserved.
- Activate and verify cloud background jobs, including scheduled fasting and automatic repeat items. The fasting worker is implemented and tested with disposable accounts but stays disabled.
- Complete account-aware Android background sync/export/reconciliation, widgets, Wear and reminders. Foreground session-bound Health Connect transfer is implemented; full native and device checks remain.
- Complete account deletion, orphan media cleanup and recovery selection. Backup download and reviewed restore are implemented. CSV exports are implemented. Snapshot deletion removes its reference; private Storage retention is not permanent deletion.
- Reconcile PC changes since the baseline and repeat record, photo, and nutrient comparisons.
- Complete the emailed password-recovery check.
- Verify the Android app with the PC server stopped.

The preview uses a separate domain. Personal data was imported only into the confirmed owner's account and verified against the source. All 34,885 catalog rows retain normalized foods, original source JSON, and dataset provenance. No production domain switch or Android address change has been performed. No billing settings were changed.

The new diary reuses the existing mobile header, group, and record renderers. Nutrition previews and saves use the existing workspace domain code. Writes run through Appwrite transactions with revision checks and durable request receipts. Live tests cover retries, rollback, simultaneous edits, and an initially empty account. Owner data was not changed during these tests.

## Backup, profile and library migration — November 15, 2026

Preview `6af9497ab5698c4c4cdb` adds complete JSON backup download with private photos, reviewed restore, and Profile & Body settings. Restore stages a private generation, verifies its records and images, then atomically replaces the current workspace head. A concurrent diary edit rejects the restore. The old generation remains retained for recovery; automatic expiry and a recovery selector are still pending.

Hosted browser checks passed for download/restore, body equation and activity, nutrient reference selection, recorded measurements, settings reload, account isolation and unchanged migrated-owner data. The mobile navigation regression also passed: the Fasting card now fits its margins without expanding the layout viewport. Disposable accounts and their resources were removed.

Named library portions, retirement/restoration and occurrence-only diary ingredient adjustments are integrated and pass local domain, HTTP and mobile browser checks. Their hosted deployment is pending. The source rules preserve quantity bases, library metadata and other diary occurrences. These editors use authenticated requests with a 4 MiB body limit; ordinary commands retain the smaller limit. Publication text now has an explicit UTF-8 check.
