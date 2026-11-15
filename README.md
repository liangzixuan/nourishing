# Nourishing

Cloud migration of the existing Nourishing nutrition app. The preview has private accounts, a diary, Foods library, nutrition reports, charts, snapshots, advanced targets, fasting controls, repeat-item review, food suggestions and nutrient search. Photo recognition uses Gemini; recipes can be imported from public URLs. New accounts start empty. The PC app remains the full product while the remaining screens, native background services and recovery workflows are migrated. PC and cloud edits are separate.

## Run

Use Node.js 22.23.4 or later. Run `npm ci` and `npm run build`, provide the environment variables listed in `.env.example`, then `npm start`. Astro's official Node adapter provides the Appwrite-supported SSR entrypoint. Production requires HTTPS. Appwrite Sites supplies an ephemeral request key with `sessions.write`, `rows.read`, `rows.write`, `files.read`, and `files.write`; private data requests use the user's session.

Run `npm test` for HTTP/session checks. `node scripts/verify-appwrite.mjs` performs an explicit live check with disposable test users and removes only the test resources it creates. It needs a short-lived operator key in `.local/integration-key.json`; never commit that file.

See `MIGRATION.md` for source review and the remaining migration scope, and `docs/data-migration.md` for storage and verification. Do not import the owner's records into an arbitrary or first-registered account.

The cloud diary is at `/diary`. The browser keeps health records in memory only. Diary writes require a same-origin authenticated request and are validated on the server with the existing domain rules. Appwrite transactions update records, the workspace digest, and a retry receipt together. Live checks are available in `scripts/verify-diary-writes.mjs` and `scripts/verify-diary-browser.mjs`; both use disposable accounts and remove their test resources.

The Foods tab supports custom foods, recipes, and meals. Recipe and meal ingredients can use catalog foods, private custom foods, or saved recipes. Quantities and nutrient previews use the existing domain calculations. Edits preserve metadata outside the editor, and deletion is rejected while an item is in use. `scripts/verify-library-browser.mjs` checks this flow and cross-account denial with disposable users. Recipe URL import retains the source and ingredient review. Photo logging scans automatically, lets the user review matches and amounts, and saves privately. Closing the photo dialog discards its unsaved state. Repeat items require review before applying. Suggestions use the existing local recipe library; they do not reproduce Cronometer’s proprietary AI corpus.

The Discover tab shows a nutrition summary and a report with date, day-completion and supplement filters. Settings supports daily nutrient targets, maximums, visibility, and dark/light/device themes. Imported calculated targets and schedules remain active; macro/energy policies, weekday schedules and day overrides have dedicated editors. Charts and snapshots are available; other Discover widgets are still pending. `node scripts/verify-targets-local.mjs` checks the production UI and domain against an in-memory fixture. `node scripts/verify-targets-browser.mjs` repeats the flow on Appwrite, checks account isolation, and removes its disposable accounts.


Android source is in `android/`. The cloud candidate uses the same Appwrite session as its WebView and supports reviewed Health Connect transfer. It has not replaced the installed APK. Unmigrated background services remain disabled in cloud builds.

Scheduled fasting code is in `server/scheduler-entry.mjs`. It is disabled by default and has not been activated for accounts. Deploy it as a private Function with no public execute permissions; activation belongs to the final cutover. Snapshot deletion removes the workspace reference and denies the app media route; unreferenced Storage files are retained privately pending a separate cleanup workflow.


Settings includes Profile & Body and Backup & Restore. Backups contain the workspace and referenced photos, not authentication or native write authority. Restore requires review, detects concurrent edits, and retains the previous generation. It does not yet provide automatic retention cleanup or a recovery-generation selector.

Named library portions and retirement/restoration use the original validators. Diary ingredient adjustments change only the selected logged occurrence; the saved recipe/meal and other entries remain unchanged.
