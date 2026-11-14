# Migration scope

Nourishing is moving from a private PC-hosted nutrition app to Appwrite Cloud. The target uses Appwrite Auth, TablesDB, Storage, Sites, and Functions. Public registration is planned. Only the current app's data will be migrated into its owner's account.

This repository currently contains the account foundation. The existing diary, catalog, photos, offline data, Android integrations, reminders, and backup workflows still need migration. The PC app remains the live product.

The earlier Nourishing project was reviewed for account lifecycle, secure sessions, password recovery, data isolation tests, deployment activation, and restore practices. Its custom PostgreSQL and Azure backend will not be carried over. The current app's nutrition rules, catalog provenance, and mobile interface remain the foundation.

Before production cutover:

- Finish owner-scoped repositories and catalog queries.
- Move photos to private Appwrite Storage and AI work to cloud jobs.
- Separate browser and Android state by account.
- Port reminders, exports, deletion, and restore.
- Rehearse import and compare record counts, photo digests, references, and nutrient totals.
- Verify the Android app with the PC server stopped.

The account candidate uses a separate preview domain. No production domain switch or personal data import has been performed.
