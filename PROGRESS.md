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

The account candidate is deployed at `https://nourishing-cloud.appwrite.network`, deployment `6af7f2bf9476f59eab4b`. Appwrite's build passed and `/healthz` returned 200. Browser checks passed for registration, saved settings after refresh, sign-out, and returning-user sign-in. The disposable browser account and profile were removed. Ten HTTP/session tests pass. Owner verification-email delivery is awaiting a user check.

Pending: email delivery/recovery completion check, full app source/data migration, Android session migration, and production cutover. The candidate is an account preview, not the migrated diary. The main domain remains unchanged.

The current organization API confirms the GitHub Student Pack, with a base price of 0, storage allowance 150, database reads 1,750,000, database writes 750,000, and batch size 1,000. These are the provider's raw plan fields; they do not establish current usage, index overhead, or a forecast of charges. No plan or billing settings were changed. Catalog capacity and query design still need validation before bulk import.

The next stage must preserve the existing food provenance and nutrition calculations while moving catalog queries and diary records to Appwrite. Personal records must be assigned only to the owner's explicitly confirmed account. The account preview contains no imported diary data.
