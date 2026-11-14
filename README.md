# Nourishing

Cloud migration of the existing Nourishing nutrition app. This branch contains Appwrite accounts and authenticated read APIs for the migrated diary, food catalog, and private photos. The full interface, write operations, Android sessions, and background work still need migration. The PC app remains the live product.

## Run

Use Node.js 22.23.4 or later. Run `npm ci` and `npm run build`, provide the environment variables listed in `.env.example`, then `npm start`. Astro's official Node adapter provides the Appwrite-supported SSR entrypoint. Production requires HTTPS. Appwrite Sites supplies an ephemeral request key with `sessions.write`, `rows.read`, and `rows.write`; private data requests use the user's session.

Run `npm test` for HTTP/session checks. `node scripts/verify-appwrite.mjs` performs an explicit live check with disposable test users and removes only the test resources it creates. It needs a short-lived operator key in `.local/integration-key.json`; never commit that file.

See `MIGRATION.md` for source review and the remaining migration scope, and `docs/data-migration.md` for storage and verification. Do not import the owner's records into an arbitrary or first-registered account.
