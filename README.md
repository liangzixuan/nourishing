# Nourishing

Cloud migration of the existing Nourishing nutrition app. The preview has private accounts, a diary, Foods library, nutrition reports, charts, snapshots, advanced targets, fasting controls, repeat-item review, food suggestions and nutrient search. Photo recognition uses Gemini; recipes can be imported from public URLs. New accounts start empty. The PC app remains the full product while the remaining screens, native background services and recovery workflows are migrated. PC and cloud edits are separate.

## Run

Use Node.js 22.23.4 or later. Run `npm ci` and `npm run build`, provide the environment variables listed in `.env.example`, then `npm start`. Astro's official Node adapter provides the Appwrite-supported SSR entrypoint. Production requires HTTPS. Appwrite Sites supplies an ephemeral request key with `sessions.write`, `rows.read`, `rows.write`, `files.read`, `files.write`, `users.read`, and `users.write`; private data requests use the user's session.

Run `npm test` for HTTP/session checks. `node scripts/verify-appwrite.mjs` performs an explicit live check with disposable test users and removes only the test resources it creates. It needs a short-lived operator key in `.local/integration-key.json`; never commit that file.

See `MIGRATION.md` for source review and the remaining migration scope, and `docs/data-migration.md` for storage and verification. Do not import the owner's records into an arbitrary or first-registered account.

The cloud diary is at `/diary`. The browser keeps health records in memory only. Diary writes require a same-origin authenticated request and are validated on the server with the existing domain rules. Appwrite transactions update records, the workspace digest, and a retry receipt together. Live checks are available in `scripts/verify-diary-writes.mjs` and `scripts/verify-diary-browser.mjs`; both use disposable accounts and remove their test resources.

The Foods tab supports custom foods, recipes, and meals. Recipe and meal ingredients can use catalog foods, private custom foods, or saved recipes. Quantities and nutrient previews use the existing domain calculations. Edits preserve metadata outside the editor, and deletion is rejected while an item is in use. `scripts/verify-library-browser.mjs` checks this flow and cross-account denial with disposable users. Recipe URL import retains the source and ingredient review. Photo logging scans automatically, lets the user review matches and amounts, and saves privately. Closing the photo dialog discards its unsaved state. Repeat items require review before applying. Suggestions use the existing local recipe library; they do not reproduce Cronometer’s proprietary AI corpus.

Discover includes Dashboard, Charts, Report and Snapshots. Dashboard reuses the source nutrition modes, energy and weight charts, streaks, fasting, sleep, news and settings. Coach, glucose/cycle cards, pinned charts and streak image sharing remain pending. Settings supports nutrient targets and dark/light/device themes; macro/energy policies, weekday schedules and day overrides have dedicated editors. `node scripts/verify-dashboard-local.mjs` checks the production UI, CSP and widget links. Hosted verification uses disposable accounts and checks account isolation.


Android source is in `android/`. The cloud candidate uses the same Appwrite session as its WebView and supports reviewed Health Connect transfer, explicit background-import consent and account-bound home widgets. Widget links preserve their destination through sign-in. It has not replaced the installed APK. Foreground export now supports explicit preview, confirmation and interrupted-write recovery for the same account. Foreground reconciliation retains account-owned batches, rechecks permissions and resolves lost replies from exact receipts. Report printing uses the existing native bridge. Automatic native exports, correction recovery, Wear and reminders remain inactive pending migration and device checks.

Scheduled fasting code is in `server/scheduler-entry.mjs`. It is disabled by default and has not been activated for accounts. Deploy it as a private Function with no public execute permissions; activation belongs to the final cutover. Snapshot deletion removes the workspace reference and denies the app media route; unreferenced Storage files are retained privately pending a separate cleanup workflow.


Settings includes Profile & Body and Backup & Restore. Backups contain the workspace, referenced photos and Health Connect export lineage, without authentication or native consent. Restore requires review, detects concurrent edits, and retains a verified previous version. Previous versions can be reviewed and restored through the same checked path. Historical rows without a retained manifest are shown as unverified. Automatic retention cleanup remains pending. Restore preserves native export identity and correction history while invalidating earlier export reviews.

Named library portions and retirement/restoration use the original validators. Diary ingredient adjustments change only the selected logged occurrence; the saved recipe/meal and other entries remain unchanged.

## Health Connect cloud verification

The cloud API provides account-bound biometric and intake export plans, review verification and reconciliation receipts. A confirmed removal retains the exact previous workspace and verified photos before atomically publishing the update and its receipt. Restore does not rewind the recovery counter. Empty snapshots do not remove records.

Existing deployments must run `scripts/provision-health-recovery.ps1` before deploying these routes. It backs up the current schema, adds two optional metadata columns and a unique account/snapshot index, then verifies them. Repeated runs leave matching schema unchanged. No application records or access permissions are changed.

`node scripts/verify-health-cloud.mjs` uses disposable Appwrite accounts to check exports, removal consent, recovery photos, lost-response replay, restore counters, concurrent edits and isolation. `node scripts/verify-health-hosted.mjs` checks the deployed HTTP routes. Both use the ignored short-lived `.local/data-key.json` operator key and record fixture ownership before writing. Native device behavior still requires a separate Pixel check.

Barcode scanning reuses the source camera and decoder, with manual barcode and branded-food search. Selected products retain Open Food Facts provenance and known nutrition values; private signed reviews feed atomic food/diary saves. Decoder assets and licenses come from pinned npm dependencies during the build. The cloud UI uses the account energy unit.

Discover → Report → Print Report captures the selected sections before displaying a script-free preview. Print / Save PDF uses the browser printer or the Android account-bound print bridge. Changes to options discard the prior capture. The report renderer and localized styles retain source hashes in `docs/print-ui-source.json` and `docs/print-ui-assets.json`.

`node scripts/verify-food-report-hosted.mjs` checks deployed barcode lookup/search, private saves, exact retries and mobile report rendering using disposable accounts. It needs the ignored temporary operator key and removes its test accounts and records.


The diary supports selection, copy/paste, clear amounts, group/time edits, reusable meals and entry ordering. Tap an energy or macro value for contributing foods; Report details use the applied report filters. Notes support camera/gallery photos with replace/remove controls. Unsaved attachment previews are discarded on close. Local browser checks are in `scripts/verify-diary-tools-local.mjs` and `scripts/verify-note-photos-local.mjs`; `scripts/verify-diary-tools-hosted.mjs` checks the deployed flows with disposable accounts.

Account supports fresh-password deletion with a resumable private status receipt. The cloud backup runner writes verified portable copies to the configured T7 volume independently of the PC app server. Deployment, retention and recovery limits are in [docs/account-lifecycle.md](docs/account-lifecycle.md).
