# Migration scope

Nourishing is moving from a private PC-hosted nutrition app to Appwrite Cloud. The target uses Appwrite Auth, TablesDB, Storage, Sites, and Functions. Public registration is planned. Only the current app's data will be migrated into its owner's account.

This repository contains accounts, a cloud diary, and a Foods library backed by the verified catalog and private records. Food search, food/recipe/meal diary entries, notes, and day completion work in the preview. Custom foods, recipes and meals can be created, edited, previewed and deleted when unused. The remaining mobile screens, offline data, Android integrations, reminders, and backup workflows still need migration. The PC remains the full product. Cloud and PC edits are separate; neither is continuously synchronized to the other.

The earlier Nourishing project was reviewed for account lifecycle, secure sessions, password recovery, data isolation tests, deployment activation, and restore practices. Its custom PostgreSQL and Azure backend will not be carried over. The current app's nutrition rules, catalog provenance, and mobile interface remain the foundation.

Before production cutover:

- Port the remaining mobile screens and mutations, including Discover, repeat items, suggestions, targets/settings, exercise, and biometric editors. Complete recipe import, library portions/retirement/sharing, and diary ingredient adjustments. Existing imported records and metadata remain preserved.
- Move AI photo processing and other background work to cloud jobs.
- Separate browser and Android state by account.
- Port reminders, exports, deletion, and restore.
- Reconcile PC changes since the baseline and repeat record, photo, and nutrient comparisons.
- Complete the emailed password-recovery check.
- Verify the Android app with the PC server stopped.

The preview uses a separate domain. Personal data was imported only into the confirmed owner's account and verified against the source. All 34,885 catalog rows retain normalized foods, original source JSON, and dataset provenance. No production domain switch or Android address change has been performed. No billing settings were changed.

The new diary reuses the existing mobile header, group, and record renderers. Nutrition previews and saves use the existing workspace domain code. Writes run through Appwrite transactions with revision checks and durable request receipts. Live tests cover retries, rollback, simultaneous edits, and an initially empty account. Owner data was not changed during these tests.
