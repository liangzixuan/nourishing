# Migration scope

Nourishing is moving from a private PC-hosted nutrition app to Appwrite Cloud. The target uses Appwrite Auth, TablesDB, Storage, Sites, and Functions. Public registration is planned. Only the current app's data will be migrated into its owner's account.

This repository contains the account foundation and authenticated read APIs for a verified copy of the diary, catalog, and private photos. The preview interface still contains the account screens. The full mobile interface, writes, offline data, Android integrations, reminders, and backup workflows still need migration. The PC app remains the live, writable product. The cloud copy is a migration baseline, not continuous synchronization.

The earlier Nourishing project was reviewed for account lifecycle, secure sessions, password recovery, data isolation tests, deployment activation, and restore practices. Its custom PostgreSQL and Azure backend will not be carried over. The current app's nutrition rules, catalog provenance, and mobile interface remain the foundation.

Before production cutover:

- Connect the full mobile interface and implement account-scoped writes, edits, settings, and new-account initialization.
- Move AI photo processing and other background work to cloud jobs.
- Separate browser and Android state by account.
- Port reminders, exports, deletion, and restore.
- Reconcile PC changes since the baseline and repeat record, photo, and nutrient comparisons.
- Complete the emailed password-recovery check.
- Verify the Android app with the PC server stopped.

The preview uses a separate domain. Personal data was imported only into the confirmed owner's account and verified against the source. All 34,885 catalog rows retain normalized foods, original source JSON, and dataset provenance. No production domain switch or Android address change has been performed. No billing settings were changed.
