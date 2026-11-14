# Appwrite migration progress

Plan: `cronometer-local/docs/superpowers/plans/2026-11-13-appwrite-accounts.md` in the source workspace.

2026-11-13:

- Renewed CLI authentication verified. Existing New York Nourishing project initially had no sites, databases, buckets, functions, or platforms.
- Created a separate checkout on `codex/appwrite-migration`, with the user-selected GitHub remote. The live PC app was not modified.
- Ruling: deliver the account foundation before copying the full source tree. The app has local evidence and reference assets that require a publication audit. This keeps the public repository free of personal data and avoids presenting local SQLite code as a cloud deployment. Full source migration remains required.
- Official SDK pinned to 31.2.0; installed package types inspected. Eight HTTP/session tests failed before implementation and then passed.
- Created serverless database `nourishing`, private `profiles` table, and server-only `login_limits` table. Table-wide permissions are empty. Row security is enabled.
- Registration uses provider rate limits. Sign-in has a durable per-email attempt budget because server session creation bypasses provider client limits. Profile creation is server-only to prevent clients reserving other account IDs.
- No billing upgrade, domain change, owner data import, or old account migration performed.
- Live provider verification passed with two disposable accounts, including direct SDK isolation and session revocation; test-owned accounts and rows were removed.
- Ruling: Appwrite rejects SSR for the Other framework. Use Astro's official Node adapter and standard Request/Response handlers, with the existing vanilla UI. No framework label workaround. The original Node-only entrypoint was removed; HTTP tests use a small Node adapter for the same handler.

The account candidate is deployed at `https://nourishing-cloud.appwrite.network`, deployment `6af7f2bf9476f59eab4b`. Appwrite's build passed and `/healthz` returned 200. Browser checks passed for registration, saved settings after refresh, sign-out, and returning-user sign-in. The disposable browser account and profile were removed. Ten HTTP/session tests pass. On November 14, the owner confirmed successful email verification, and Appwrite Auth independently returned one matching active, verified account. Its identity is retained only in the private migration record.

Pending: emailed password-recovery completion check, full app source/data migration, Android session migration, and production cutover. The candidate is an account preview, not the migrated diary. The main domain remains unchanged.

The current organization API confirms the GitHub Student Pack, with a base price of 0, storage allowance 150, database reads 1,750,000, database writes 750,000, and batch size 1,000. These are the provider's raw plan fields; they do not establish current usage, index overhead, or a forecast of charges. No plan or billing settings were changed. Catalog capacity and query design still need validation before bulk import.

The next stage must preserve the existing food provenance and nutrition calculations while moving catalog queries and diary records to Appwrite. Personal records must be assigned only to the owner's explicitly confirmed account. The account preview contains no imported diary data.

2026-11-14: Prepared a private, consistent source baseline using SQLite online backup and the existing application's backup validator and nutrition calculations. Eight focused migration tests pass. The source check preserves committed WAL data, rejects missing food references and unmapped tables, records image/record hashes, and keeps auxiliary replay content out of the comparison manifest. Validation adds only absent chart-display defaults in the current source; daily nutrition results are unchanged. These checks establish a local baseline, not an Appwrite import or restore. The operator script and tests currently live with the source app because they use its domain modules. The recovery file can contain PC notification credentials and must remain local. No personal data was uploaded.

## Storage stage — November 14, 2026

This stage supersedes the earlier account-only and no-import status above.

- Created five TablesDB tables with row security and no table-wide permissions, plus the private file-security bucket.
- Imported all 34,885 foods with normalized data, original source records, and dataset provenance. Every write response matched its source fields; all remote row digests matched a second source pass. Three complete record reads also matched the source database.
- Imported the confirmed owner's baseline workspace as separate private records and private photos. The complete workspace JSON round trip, every photo byte digest, and all baseline daily nutrition results matched. The complete SQLite file and auxiliary PC credentials were not uploaded.
- Copied the existing nutrition calculation dependency closure, with source/output hashes in `docs/domain-source-manifest.json`. Its only external dependency is the existing `big.js` version.
- Fixed pagination after a live check showed Appwrite caps result counts at 5,000. Queries fetch one extra row; live checks covered offset 5,000 and the final catalog page.
- Twenty-one local tests and the Astro build passed. Direct provider checks denied anonymous and second-account access to owner records and photos, while permitting the fixture's own records and shared catalog. Short-prefix and accent-normalized searches passed.
- Activated preview deployment `6af802137fcf43535d3c`. Hosted checks passed for login, private diary reads, catalog reads, no-store responses, rejected owner parameters, cross-account photo denial, and session revocation. Disposable accounts and their records were removed.

Reports and destination identity remain in ignored local files. The preview still shows the account interface; its new data APIs are read-only. The PC remains the live writable source, and its changes after the baseline are not synchronized. No production domain or Android address was changed.

Next: connect the mobile interface, implement account-scoped writes and new-account initialization, then migrate offline/Android sessions and background jobs. Before cutover, reconcile the latest PC data and repeat comparison and PC-off device checks. See `MIGRATION.md` for the remaining scope.
