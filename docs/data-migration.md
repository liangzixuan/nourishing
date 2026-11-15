# Data migration

Import scripts run on the operator's computer and are not deployed with the site. SQLite databases, manifests, API keys, and reports belong under the ignored `.local/` directory and must never be published.

## Storage ownership

`workspace_records` stores each array item and each top-level object separately, with owner ID, generation, source ID, position, original JSON, and digest. `workspace_heads` identifies the generation and its current layout. The importer reconstructs and compares the entire workspace before publishing that pointer. Direct client permissions remain read-only. The HTTP API derives the owner from the authenticated Appwrite account; it accepts no owner parameter. Validated server commands perform writes through transactions.

`workspace_media` maps source photo identities to private Storage files. Both metadata rows and files have only the owner's read permission. The `private-media` bucket has file security enabled and no bucket-wide permissions. A session must pass both metadata and file access checks.

`catalog_foods` retains normalized food data, original source JSON, compact search records, and source IDs. `catalog_heads` selects a fully verified generation. Catalog rows are readable by signed-in users. Table-wide permissions are empty on all tables and row security is enabled. Source nutrients and missing values are preserved.

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

## Workspace writes

`POST /api/workspace/command` accepts `requestId`, `revision`, `type`, and a strictly checked `payload`. The named command registries in `server/workspace-commands.mjs` and its feature modules define the accepted actions and fields. Note editing supports photo attachment, replacement, removal and deletion. `POST /api/diary/preview` uses the same quantity and nutrition rules without saving.

`GET /api/library` returns the owner's private item list and nutrient definitions. `GET /api/library/item?kind=food|recipe|meal&id=...` returns a saved item and its supported quantity choices; food lookup falls back to the shared catalog. An optional `entryId` uses that owner's diary occurrence for recipe quantity overrides. `POST /api/library/preview` validates and calculates an unsaved library draft without persisting it. No endpoint accepts a caller-selected owner.

Custom food nutrients are explicit user input. Recipe and meal ingredients accept only food/recipe identities and quantities. The server reads any shared catalog ingredients and captures their authoritative source facts before saving; client nutrition or provenance cannot replace those facts. Partial library edits merge into the owner's existing item before domain validation, preserving fields outside the editor. Existing dependencies and measured consumers are validated by the original domain code. A saved item cannot be deleted while diary entries, recipes, meals or repeat items use it. The editor currently supports basic fields and preserves existing named portions, source histories and other metadata; advanced library tools remain pending.

After authenticating the session, the server uses its row-write key to stage the workspace head, validate its revision, read the records, and apply a permitted domain command. Only changed rows are staged. The final head and a `command_receipts` row commit in the same transaction. A duplicate request returns its stored result; reuse with different input fails. Competing saves conflict on the shared head. Failed operations roll back, with the provider's transaction TTL as the final expiry bound. No automatic conflict overwrite is performed.

New accounts receive the original app's empty initial state and editable default targets, with no demo foods or diary entries. Catalog selection captures source facts on the server. Clients cannot submit replacement nutrient data through diary commands.

The implementation uses the row-level transactions supported by the installed SDK and current Appwrite service. Operator and site keys need the existing row scopes; no separate transaction scope is required. Each transaction remains subject to the provider's operation limit. The current layout updates ordinal positions after deletion; large-account write scaling remains unverified.

The browser stores no diary data or session tokens in local storage. It clears in-memory records on page exit and reloads authenticated state on history restoration. The full offline application and Android session lifecycle are separate remaining stages.

## Cutover boundary

The cloud diary can now receive edits. The PC also remains writable. Before switching users to the cloud, implement the remaining features and account lifecycle, reconcile both copies, and repeat record, media, and daily-nutrition comparisons. The importer rejects changed rows instead of overwriting cloud edits. Do not treat the baseline as a final cutover or delete the local recovery copy.

## Targets and nutrition reports

`GET /api/targets?date=YYYY-MM-DD` projects effective nutrient targets, maximums, visibility and each target's owning policy. `nutrientTarget.patch` accepts only a date, nutrient ID and changed fields. The original domain rejects target edits controlled by an imported schedule, macro policy or calculated-energy policy. Other settings are preserved. `preferences.patch` currently accepts only the theme.

`GET /api/nutrition-report` requires `from`, `to`, `dayFilter` (`all`, `nonempty` or `complete`), `includeToday` and `includeSupplements` (literal `true` or `false`). The original report capture owns averages, missing/partial data, targets, supplement filtering and provenance. Its server clock uses the account profile time zone. Completed zero-intake days remain distinct from unlogged days. The UI presents daily averages and per-nutrient coverage; unsupported advanced Discover cards are not presented as migrated.

Both reads require the account session, reject owner overrides and return `no-store`. Target writes use the same atomic revision and receipt boundary as diary/library writes. Theme follows live device changes in System mode and persists per account; the initial state is dark. Report and settings state stays in memory and is disposed when leaving the screen.


## Diary tools, nutrient contributors and note photos

`POST /api/diary/tools/review` captures a selection or previews copy, clear-amount and reusable-meal actions. `POST /api/diary/tools/save` uses the shared revision and receipt boundary. Selection fingerprints retain source identity; stale selections and completed-day writes fail before committing. The clipboard remains in browser memory and is cleared on page exit.

`POST /api/nutrient-detail` reads a day or selected entries. `POST /api/nutrition-report/nutrient` reads contributors under the applied report filters. Both return canonical source facts and the account energy preference. The UI converts energy for display; missing measurements remain distinct from measured zero.

`POST /api/note-photos/prepare` normalizes an image without persisting it. `POST /api/note-photos/save` stages private media and commits the note, workspace revision and receipt together. An edit also requires the note revision. `GET /api/media?namespace=note_photos&id=...` requires an active note reference in that account. Replacement or removal denies the old app URL once no current note references it. Stored bytes remain private for retained recovery until the separate cleanup workflow is implemented.
