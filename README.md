# Nourishing

Nourishing is an installable PWA hosted at [nourishing.app](https://nourishing.app) on Appwrite, with public registration and private account data. It includes a diary, Foods library, nutrition reports, charts, snapshots, targets, fasting, repeat-item review, food suggestions and nutrient search. Photo recognition uses Gemini; recipes can be imported from public URLs. New accounts start empty. Production-domain checks passed, and the owner confirmed installation and diary access on a Pixel. Visual parity with the local app is incomplete; emailed password recovery and remaining phone camera/notification/offline checks are pending. PC and cloud edits are separate.

## Run

Use Node.js 22.23.4 or later. Run `npm ci` and `npm run build`, provide the environment variables listed in `.env.example`, then `npm start`. Astro's official Node adapter provides the Appwrite-supported SSR entrypoint. Production requires HTTPS. Appwrite Sites supplies an ephemeral request key with `sessions.write`, `rows.read`, `rows.write`, `files.read`, `files.write`, `users.read`, and `users.write`; private data requests use the user's session.

Run `npm test` for HTTP/session checks. `node scripts/verify-appwrite.mjs` performs an explicit live check with disposable test users and removes only the test resources it creates. It needs a short-lived operator key in `.local/integration-key.json`; never commit that file.

See `MIGRATION.md` for source review and the remaining migration scope, and `docs/data-migration.md` for storage and verification. Do not import the owner's records into an arbitrary or first-registered account.

The cloud diary is at `/diary`. Diary writes require a same-origin authenticated request and are validated on the server with the existing domain rules. Appwrite transactions update records, the workspace digest, and a retry receipt together. The offline diary stores an account-bound copy and queued edits in IndexedDB. Logout clears those copies; service-worker caches contain public assets only. See [docs/offline-parity.md](docs/offline-parity.md) for supported offline edits and verification limits.

The Foods tab supports custom foods, recipes, and meals. Recipe and meal ingredients can use catalog foods, private custom foods, or saved recipes. Quantities and nutrient previews use the existing domain calculations. Edits preserve metadata outside the editor, and deletion is rejected while an item is in use. The current Custom Food, Recipe and Meal hosted verifiers check the restored editors with disposable users; `scripts/verify-recipe-cloud.mjs` checks catalog capture and cross-account denial. Recipe URL import retains the source and ingredient review. Photo logging scans automatically, lets the user review matches and amounts, and saves privately. Closing the photo dialog discards its unsaved state. Repeat items require review before applying. Suggestions use the existing local recipe library; they do not reproduce Cronometer’s proprietary AI corpus.

Discover includes Dashboard, Charts, Report and Snapshots. Dashboard reuses the source nutrition modes, energy and weight charts, streaks, fasting, sleep, news and settings. Coach, glucose/cycle cards, pinned charts and streak image sharing are deployed. Settings supports nutrient targets and dark/light/device themes; macro/energy policies, weekday schedules and day overrides have dedicated editors. Glucose source settings, timeline, CGM comparisons/ranges/statistics and reviewed cycle import/removal reuse the source domain and renderers. Hosted verification uses disposable accounts and checks account isolation.


Install the PWA from a supported browser. Native APK delivery, Health Connect, Wear and Android widgets are outside the current product scope. Retained Android source is historical and is not packaged with the cloud site. Previously imported health records and provenance remain preserved. Browser push uses Web Push and VAPID; Firebase configuration is not required.

Scheduled fasting and reminders run in private Appwrite Functions with hourly repair. Reminder delivery requires the user's browser subscription and enabled schedule. Installed-phone delivery still needs verification. Snapshot deletion removes the workspace reference and denies the app media route; private recovery data remains retained.


Settings includes Profile & Body and Backup & Restore. Backups contain the workspace, referenced photos and historical import lineage, without authentication credentials. Restore requires review, detects concurrent edits, and retains a verified previous version. Previous versions can be reviewed and restored through the same checked path and are retained indefinitely. Temporary backup reviews and expired notification receipts have automated cleanup. Historical rows without a retained manifest are shown as unverified.

Named library portions and retirement/restoration use the original validators. Diary ingredient adjustments change only the selected logged occurrence; the saved recipe/meal and other entries remain unchanged.

Barcode scanning reuses the source camera and decoder, with manual barcode and branded-food search. Selected products retain Open Food Facts provenance and known nutrition values; private signed reviews feed atomic food/diary saves. Decoder assets and licenses come from pinned npm dependencies during the build. The cloud UI uses the account energy unit.

Discover → Report → Print Report captures the selected sections before displaying a script-free preview. Print / Save PDF uses the browser printer. Changes to options discard the prior capture. The report renderer and localized styles retain source hashes in `docs/print-ui-source.json` and `docs/print-ui-assets.json`.

`node scripts/verify-food-report-hosted.mjs` checks deployed barcode lookup/search, private saves, exact retries and mobile report rendering using disposable accounts. It needs the ignored temporary operator key and removes its test accounts and records.


The diary supports selection, copy/paste, clear amounts, group/time edits, reusable meals and entry ordering. Tap an energy or macro value for contributing foods; Report details use the applied report filters. Notes support camera/gallery photos with replace/remove controls. Unsaved attachment previews are discarded on close. Local browser checks are in `scripts/verify-diary-tools-local.mjs` and `scripts/verify-note-photos-local.mjs`; `scripts/verify-diary-tools-hosted.mjs` checks the deployed flows with disposable accounts.

Account supports fresh-password deletion with a resumable private status receipt. The cloud backup runner writes verified portable copies to the configured T7 volume independently of the PC app server. Deployment, retention and recovery limits are in [docs/account-lifecycle.md](docs/account-lifecycle.md).
