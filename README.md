# Nourishing

Cloud migration of the existing Nourishing nutrition app. This branch contains Appwrite accounts, a cloud diary, a private Foods library, nutrient targets, and nutrition reports. Search foods, create custom foods/recipes/meals, log and edit their diary entries, add notes, and complete or reopen a day. New accounts start empty. The remaining screens, Android sessions, offline support, and background work still need migration. The PC app remains the full product; cloud and PC changes are not synchronized.

## Run

Use Node.js 22.23.4 or later. Run `npm ci` and `npm run build`, provide the environment variables listed in `.env.example`, then `npm start`. Astro's official Node adapter provides the Appwrite-supported SSR entrypoint. Production requires HTTPS. Appwrite Sites supplies an ephemeral request key with `sessions.write`, `rows.read`, and `rows.write`; private data requests use the user's session.

Run `npm test` for HTTP/session checks. `node scripts/verify-appwrite.mjs` performs an explicit live check with disposable test users and removes only the test resources it creates. It needs a short-lived operator key in `.local/integration-key.json`; never commit that file.

See `MIGRATION.md` for source review and the remaining migration scope, and `docs/data-migration.md` for storage and verification. Do not import the owner's records into an arbitrary or first-registered account.

The cloud diary is at `/diary`. The browser keeps health records in memory only. Diary writes require a same-origin authenticated request and are validated on the server with the existing domain rules. Appwrite transactions update records, the workspace digest, and a retry receipt together. Live checks are available in `scripts/verify-diary-writes.mjs` and `scripts/verify-diary-browser.mjs`; both use disposable accounts and remove their test resources.

The Foods tab supports custom foods, recipes, and meals. Recipe and meal ingredients can use catalog foods, private custom foods, or saved recipes. Quantities and nutrient previews use the existing domain calculations. Edits preserve metadata outside the editor, and deletion is rejected while an item is in use. `scripts/verify-library-browser.mjs` checks this flow and cross-account denial with disposable users. Recipe URL import, photo logging, repeat items, and suggestions still need cloud migration.

The Discover tab shows a nutrition summary and a report with date, day-completion and supplement filters. Settings supports daily nutrient targets, maximums, visibility, and dark/light/device themes. Imported calculated targets and schedules remain active; their setup editors and the remaining Discover widgets are still pending. `node scripts/verify-targets-local.mjs` checks the production UI and domain against an in-memory fixture. `node scripts/verify-targets-browser.mjs` repeats the flow on Appwrite, checks account isolation, and removes its disposable accounts.
