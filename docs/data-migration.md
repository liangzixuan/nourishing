# Data migration

Import scripts run on the operator's computer and are not deployed with the site. SQLite databases, manifests, API keys, and reports belong under the ignored `.local/` directory and must never be published.

## Storage ownership

`workspace_records` stores each array item and each top-level object separately, with owner ID, generation, source ID, position, original JSON, and digest. `workspace_heads` identifies the verified generation and its layout. The importer reconstructs and compares the entire workspace before publishing that pointer. Records are read-only to their owner during this stage. The HTTP API derives the owner from the authenticated Appwrite account; it accepts no owner parameter.

`workspace_media` maps source photo identities to private Storage files. Both metadata rows and files have only the owner's read permission. The `private-media` bucket has file security enabled and no bucket-wide permissions. A session must pass both metadata and file access checks.

`catalog_foods` retains normalized food data, original source JSON, compact search records, and source IDs. `catalog_heads` selects a fully verified generation. Catalog rows are readable by signed-in users. Table-wide permissions are empty on all five tables and row security is enabled. Source nutrients and missing values are preserved.

## Operator commands

Use the selected project's authenticated Appwrite CLI session for schema and bucket setup. `node scripts/data-schema.mjs` generates `.local/data-schema.json`; `scripts/provision-data.ps1` creates absent tables and waits for their columns and indexes. Existing tables are not replaced.

Data scripts read a short-lived operator key from `.local/data-key.json`, shaped as `{"secret":"..."}`. Import requires `rows.read`, `rows.write`, `users.read`, `files.read`, and `files.write`. Live disposable-account verification also needs `users.write` and `sessions.write`. Keep the key out of command arguments, logs, and Git.

```powershell
node scripts/import-catalog.mjs PATH_TO_SOURCE_CATALOG_SQLITE
node scripts/import-workspace.mjs PATH_TO_BASELINE_MANIFEST
node scripts/verify-data.mjs PATH_TO_SOURCE_CATALOG_SQLITE
$env:VERIFY_ORIGIN='https://nourishing-cloud.appwrite.network'
node scripts/verify-data.mjs PATH_TO_SOURCE_CATALOG_SQLITE
```

The workspace importer also requires the private `.local/migration-destination.json` produced by the confirmed account lookup. It verifies that the live account is active, email-verified, and matches that destination. It checks the baseline snapshot hash before reading it. The complete SQLite recovery file is never uploaded: only workspace JSON and approved photo bytes are imported. PC credentials and auxiliary tables are excluded.

Imports resume matching rows and reject conflicting rows. They do not overwrite a different active workspace or catalog generation. Catalog batches are limited to 100 rows or approximately 2 MiB, with at most four concurrent requests. Failure stops new work and waits for active requests to finish. A single source record larger than that batch target remains one row.

Reports are written to `.local/catalog-import.json`, `.local/workspace-import.json`, and `.local/data-verification.json` after the associated checks pass. The verification script creates a disposable account, tests direct provider permissions and optionally hosted APIs, then removes its test records and account.

## Read APIs

All routes require the secure account session cookie and return `Cache-Control: no-store`:

- `GET /api/diary?date=YYYY-MM-DD`
- `GET /api/catalog/status`
- `GET /api/catalog/search?q=rice&offset=0&limit=25`
- `GET /api/catalog/food?id=SOURCE_ID`
- `GET /api/media?namespace=meal_photos&id=SOURCE_IMAGE_ID`

Search returns `nextOffset`; filtered search totals are `null` because Appwrite count estimates can be capped. An empty search returns the verified full catalog count. Pagination fetches one extra row to detect whether more results exist.

The current diary reader reconstructs the account's complete workspace for the existing nutrition calculation. This has been checked against the migration baseline, not load-tested for large multi-year accounts. The imported calculation dependency closure and its source hashes are recorded in `domain-source-manifest.json`.

## Cutover boundary

These APIs expose a verified read-only copy. The PC continues to receive edits. Before switching users to the cloud, implement the remaining mutations and account lifecycle, reconcile the latest PC state, and repeat record, media, and daily-nutrition comparisons. Do not treat this baseline as the final cutover or delete the local recovery copy.
