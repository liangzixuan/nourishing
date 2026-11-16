# Active goal — revised November 16, 2026

Finish Nourishing as an Appwrite-hosted, installable PWA at https://nourishing.app. Preserve the current account and diary data, support public signup with private account data, and remove dependence on the PC server, Tailscale, APK distribution, Health Connect and native Firebase setup. Restore the saved local/Cronometer UI through working cloud adapters, validate each complete flow, deploy it, and continue through the remaining gap list.

Acceptance:
- Source-based main screens and child workflows are implemented; discrepancies are recorded and resolved using the latest saved screenshots before manuals.
- Food search, food entry, Photo Log, barcode, diary editing, charts/reports, settings and account flows work against Appwrite.
- Account isolation, existing data reconciliation, backup/restore, reminders and offline behavior retain their verified guarantees after relevant changes.
- Each deployed increment has appropriate automated and live-browser verification with disposable fixtures; owner data remains unchanged.
- Device-only checks and deferred password-recovery email checks are explicitly identified and requested only when they become the remaining blocker.

Completed increments: rich food search, source food-entry layout, compact Photo Log nutrition review, multi-add with recipe creation and safe retry, Food entry Edit a copy, and Photo Log Create Meal/Recipe, deployed and verified on November 16. Mixed Diary records are also deployed and verified. CGM detail/comparison, Report nutrient detail and Snapshot child editors are deployed and verified. Targets/Nutrient Targets and Create/Edit Custom Chart are now deployed and verified. Suggest Food, Repeat Items and Custom Food are also deployed and verified. Oracle, generic Chart detail and Energy Expenditure are also deployed and verified. Meal editor, Weight Goal and fasting are now deployed and hosted-verified. Next: Recipe and reviewed library edits, Macro & Energy, then the remaining target, Display and record-editor tools listed in docs/ui-parity.md. The platform goal remains active; its older APK objective text is superseded by this user-approved PWA scope because the available goal API cannot edit objective text.

---

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

## Writable diary stage — November 14, 2026

This stage supersedes the read-only preview status above.

- Activated preview deployment `6af80d58d2a63e19042a` at `/diary`. It supports catalog search, food nutrition previews, food entry addition/editing/deletion, notes, and completing or reopening a day. New accounts start empty.
- Reused the existing workspace domain rules and mobile diary renderers. The static dependency manifest now covers 182 files; the dependency list in the earlier storage-stage entry is historical.
- Added server-owned commands with authenticated owner identity, revision checks, and Appwrite transactions. Record changes, the workspace digest, and retry receipts commit together. Clients cannot supply nutrition facts or another owner's identity.
- Live disposable-account checks passed for initialization, duplicate retry prevention, stale revisions, invalid-edit rollback, simultaneous edits, and deletion. Hosted browser checks passed for sign-in, search/preview, add/reload/edit/delete, notes, day completion, outside-tap dismissal, and sign-out. Mobile screenshots were inspected and the date-picker icon was corrected.
- Repeated hosted/provider isolation checks passed: anonymous users and a second account could not read or change owner records or read owner photos. Catalog samples and fixture nutrition comparisons passed. Verification accounts and their records were removed.
- The owner's workspace digest still matched the imported baseline, and its three daily diary projections loaded. These checks did not write owner data.

Local tests and the Astro build passed. Detailed reports, credentials, fixture screenshots, and owner identity remain ignored. The preview and PC are separate writable copies; neither automatically synchronizes changes to the other. The existing importer rejects conflicting cloud rows, so final cutover must reconcile both copies before importing again.

Remaining: the other app screens and mutations, cloud AI/background jobs, account-aware Android/offline behavior, reminders, exports/deletion/restore, password-recovery completion, and final domain/device cutover. Large multi-year workspaces and transaction operation limits have not been load-tested. No production domain or Android address changed.

## Foods library stage — November 14, 2026

- Added private custom foods, recipes and meals to the Foods tab. Editors support basic fields, nutrient values, measured ingredients, recipe yield, cooked weight and volume. Fields outside these editors remain preserved. Existing named portions can be used for logging but cannot yet be edited here.
- Added shared catalog/private food/recipe/meal selection to diary logging. Recipe and meal entries now support quantity edits and nutrition previews. Ingredient catalog records are fetched and captured on the server; client-supplied source or nutrient fields cannot replace them.
- Moved diary and library writes into one workspace command boundary and retained the transaction, conflict and receipt rules. Partial library edits pass through the original validators. Items in use cannot be deleted, and cyclic or missing recipe references fail validation.
- Thirty local tests pass. Provider transaction checks passed for duplicate retries, stale revisions, rollback and competing edits. A read-only check projected all 41 imported library items and confirmed that the owner's workspace digest was unchanged.
- Browser testing found a race between background library refresh and item loading. The item dialog now owns its loading state independently, and saves finish refreshing before the dialog closes. A targeted browser regression failed against the prior code and passed with the fix, including dismissal before a late response.
- One provider connection timeout interrupted disposable-account cleanup. The recorded fixture was subsequently removed. The verification script now retains cleanup ownership and reports the original failure instead of replacing it with a cleanup exception.

Deployment `6af88506c12e0645c778` is active on the preview. Final hosted verification passed for custom food creation/reload, measured recipe ingredients, server-captured catalog ingredients, nested meals, meal logging and quantity edits, dependent nutrient updates, deletion-in-use rejection, and cross-account read/write denial. The browser reported no horizontal overflow or script errors. All disposable accounts and their records were removed. The existing diary browser flow also passed after the shared command/picker changes; the later dialog ownership fix was covered by the targeted regression and final library flow. Phone-sized editor and diary screenshots were inspected.

Recipe URL import, library sharing/retirement/portion editors, diary ingredient adjustments, repeat items, food suggestions, and the other migration work remain outside this increment. The PC, Android address and production domain remain unchanged. Next: migrate targets/settings and the Discover dashboard/report views, followed by AI/background work and Android account integration.

## Targets and nutrition reports — November 14, 2026

Preview deployment `6af93042af0771918a99` adds Settings and Discover navigation. Settings supports daily nutrient targets, maximums, visibility, and dark/light/device themes. Discover shows a nutrition summary and a full nutrient report with date range, logged/completed/all-day selection, today and supplement filters. Common nutrients appear first; additional fields are collapsed. View full report opens the Report tab.

The original domain owns target resolution, edit restrictions, averages, missing-data handling, supplement rules and provenance. Imported calculated targets and schedules remain active and cannot be overwritten through the simple editor. Report filtering uses the account time zone. Target and theme writes use the existing atomic command/receipt boundary. No copied domain files changed.

Validation: all 36 unit/HTTP tests passed, including target preservation, scheduled-target rejection, complete-zero versus unknown days, and a time-zone date boundary. The Astro build passed. Local and hosted phone-width browser checks passed for theme persistence and live system-theme changes, target/maximum saves, report calculations, visibility, completed-day filtering, invalid-range recovery and delayed responses after tab navigation. Hosted checks confirmed independent second-account targets and empty reports, rejected owner overrides and stale revisions, and no browser errors or horizontal overflow. Test accounts and records were removed. The confirmed owner's workspace digest still matches the migration baseline. Hosted screenshots were inspected. The existing diary browser regression also passed: sign-in, catalog search, add/reload/edit/delete, day completion, notes, outside dismissal and sign-out.

This is the first cloud Discover/settings increment. Advanced target setup and schedules, the other Discover widgets/charts/snapshots, and remaining feature migrations are still pending. The PC, Android address and production domain are unchanged. Continue with exercise/biometric editing and advanced target settings before AI/background jobs and Android account integration.


## Continuous cloud migration — November 14, 2026

Preview deployment `6af9460c1efe27ee53d4` adds exercise/biometric/note editors, advanced macro and energy policies, repeat-item review, Charts, Snapshots, fasting controls, recipe import, local food suggestions, the Nutrient Oracle, Gemini photo logging, Health Connect transfer and CSV export. This supersedes the pending-feature lists in earlier entries; `MIGRATION.md` tracks remaining scope.

The original domain calculations and validators remain the source of truth. Imported recipe quantities, source URL and review evidence survive cloud saving. Snapshot and photo records use private media and atomic workspace writes. Health Connect requires a preview bound to the account and workspace revision before import. The Android candidate now uses the WebView account session for foreground transfer; it is not an installed update, and unmigrated native background services remain disabled.

Validation includes local domain/HTTP tests, mobile browser fixtures, and actual built SSR checks. The latter exposed a 16 KiB adapter limit that blocked photo/Health Connect bodies and a separately packaged recipe worker dependency. Both were corrected and checked against the built server. Public recipe transport checks cover DNS pinning, redirects, private addresses and bounded decompression; live recipe saves used fixture HTML, not an external recipe site.

Live disposable Appwrite tests passed for photo writes, snapshots, recipe source/nutrition retention, scheduler transactions, idempotent retry, stale revisions and cross-account denial. Hosted checks passed for measured meal/exercise/note writes, advanced target reads, complete-catalog nutrient ranking, suggestions, CSV, Health Connect preview/import/replay, mobile Charts/Snapshots navigation and real Gemini scanning. The uploaded meal produced three matched rows; closing the dialog discarded its unsaved state. Test accounts, records and images were removed. The confirmed owner's workspace digest remained equal to the imported baseline.

The full catalog JSON initially peaked at 623 MiB locally. A compact representation preserves all 34,885 foods and nutrient values, with shared dictionaries and flat nutrient pairs. The measured local combined load/ranking peak was 449 MiB. Hosted first/warm Oracle requests took about 10.0/3.8 seconds. Gemini alone took 3.5 seconds; hosted upload, recognition and source matching took 9.6 seconds. Hosted CPU and peak memory were not measured.

The private `nourishing-scheduler` Function was deployed with no user execute permissions, no schedule, and disabled. Its actual cloud invocation returned the disabled no-op response. No account-wide job ran. Snapshot deletion removes its active reference and app access; orphan Storage cleanup is still pending. Deleted private blobs are not claimed to be permanently erased.

Source provenance checks now validate both working files and staged Git blobs for 209 copied domain files. JavaScript line endings are canonical; JSON evidence assets retain their bytes. The publication audit found no known API keys, owner identifiers, private artifacts or mismatched source hashes in 618 staged files.

Backup/restore and direct profile settings are the next integration batch. The PC server, production domain and installed Android URL remain unchanged. Final cutover still needs current-data reconciliation, the remaining native/background work, recovery checks and PC-off device validation.


## Recovery and profile validation — November 15, 2026

Active preview: `6af9497ab5698c4c4cdb`. Backup and profile hosted browser checks passed, with all disposable resources removed and migrated-owner data unchanged. Backup validation preserves an omitted optional snapshots field in the actual imported workspace. Read-only export of that workspace passed with 76 array records and three referenced photos; its generation, digest and update time stayed unchanged.

The navigation regression passed on the deployed code. A full-width Fasting button had exceeded its container because of outer margins, expanding the mobile layout viewport; the width now includes those margins, and verification compares layout and visual viewport dimensions.

The next local candidate includes named library portions, retirement/restoration and diary ingredient adjustments. All 140 local tests pass. These features still need hosted validation. A shared error helper was moved out of the command registry so read projections do not depend on command registration. UTF-8 source/document validation catches Windows encoding drift. The production domain, PC data and installed Android app are unchanged.

## Dashboard, library and retained recovery — November 15, 2026

Active preview: `6af9538e4a5e7241e9ac`. Hosted library checks passed for named portions, retirement/restoration, draft retention, large saves, replay and request limits. Diary ingredient edits passed occurrence isolation and stale-revision checks. A real public recipe URL fetched and parsed successfully without writing account data.

The source Dashboard includes nutrition modes, energy/weight charts, streaks, fasting, sleep, news and settings. Hosted checks passed source logging, settings, chart rendering, Report navigation, private widget identity, account isolation and all three widget links through sign-in. An Appwrite static-index routing defect found during these checks was fixed at the client entry; local verification now reproduces static-index precedence.

Previous versions are retained with exact head manifests in the restore transaction. The selection screen keeps unverified historical and incomplete staged generations unavailable. Actual Appwrite and hosted mobile checks passed Review, Cancel, Replace, photo integrity, receipt replay, stale/concurrent edits and account isolation. Corrupt-photo rejection passed locally. A newly added live corrupt-photo scenario has not run. All disposable resources from executed checks were removed.

Health Connect export lineage, draft and policy metadata now have strict cloud representation and backup support. The verified owner's original PC export namespace was imported after hosted checks, with exact unrelated-data comparison and repeated-apply verification. No source SQLite data changed. A subsequent read-only owner backup and Dashboard check passed. Native exports and correction/reconciliation endpoints remain pending; no phone writes were enabled.

Validation: 172 tests pass, the production build and built HTTP/body/recipe-worker checks pass, and Android source compiles with 30 focused tests passing. The publication audit covers 715 files and 221 copied domain modules, plus Dashboard source assets. Known credentials, owner identity and private artifacts are absent from staged content. The candidate Android background-import and widget implementation is not installed. Native export/reconciliation, Wear/reminders, account deletion/orphan cleanup, remaining product screens, current-data reconciliation and PC-off device testing remain before production cutover. No production domain or installed Android origin change was made.


## Health Connect exports and atomic reconciliation — November 15, 2026

Preview deployment `6af95e7dd4305dedd2a5` is active. It provides biometric/intake export options, previews and verification, plus reconciliation previews, confirmed application and exact receipt lookup. The existing domain projections and record identities are preserved. Reviews bind to the authenticated account, workspace namespace and restore scope.

A confirmed health-record removal now verifies and retains the exact prior workspace and photos. The fresh generation, recovery marker, monotonic snapshot number and receipt commit together. Empty snapshots do not imply deletion. Restore does not rewind the counter. Shared generation and media helpers replace duplicate staging and validation code.

Validation completed:

- 194 server tests and the production build passed.
- The built-server gate passed sixteen route checks, including authentication before upload and correct 413 responses. It caught a competing framework stream limit; the API is now the sole owner of request limits.
- Actual Appwrite checks passed for unit conversion, absent nutrients, imports, removal consent, immutable photo recovery, lost-response retry, counters across restore, concurrent edits and cross-account denial.
- Hosted HTTP checks passed for both export services, account-bound review tokens, reconciliation summaries, confirmed deletion, retry/receipt lookup and retained recovery. Disposable resources were removed; the real owner's workspace was unchanged.
- Android foreground export compiles and passes 37 focused tests. It retains pending write intent and verified receipts under the original origin/account/namespace across logout. No APK was installed and no native health records were written.
- Additive recovery schema provisioning passed twice. Prior schema snapshots remain local. Publication audit covered 740 files and 231 domain provenance entries; known credentials, owner identity and private artifacts were absent.

Production `nourishing.app`, the installed Android connection and background services remain unchanged. Phone reconciliation integration and correction recovery are still pending; the native export candidate needs a physical-device check. PC/cloud edits remain separate until final reconciliation and cutover.


## Barcode, captured reports and Android reconciliation — November 15, 2026

Preview deployment `6af9658a387768d8cdce` is active and adds the original camera/manual barcode scanner and Open Food Facts product search. Provider facts are signed for the account and expire; server commands save the custom food, diary entry, streak and retry receipt together. Known values, absent nutrients and source provenance remain distinct. The review uses the account’s kcal/kJ preference. The shared provider budget persists across runtime restarts. Decoder assets and licenses are packaged from pinned dependencies during the build.

Discover → Report includes captured nutrition reports and Print / Save PDF. The source renderer and localized CSS retain provenance. The cloud copy emits external styles at the rendering boundary, preserving strict CSP and original SVG chart colors. The report screen separates options from the captured preview. Closing, changing options or changing accounts clears the capture. Food/recipe printouts and report-only chart editing remain pending.

Android foreground reconciliation reuses the source cursor/outbox owner inside an origin/account/namespace envelope. It checks permissions after capture, requires removal consent and resolves exact receipts after a lost response or logout. The existing print bridge carries the captured account ID and loaded report CSS into a private offline print WebView. Account checks run before rendering and opening Android’s print dialog. Neither feature has been installed or tested on a physical phone.

Local validation: 212 server/browser tests passed, along with the production build and 20 built-server request checks. The real scanner WASM decoded a generated EAN13 under production CSP; camera cleanup, manual entry, branded search, save-only, diary save and lost-reply retries passed. The report browser test covered loaded CSS, English/French, kJ, immutable captures, saved charts, escaping and account changes. Android source and instrumentation code compile; 64 focused unit tests and the browser print handoff pass. Recovery history now exposes the snapshot number from Health Connect removal receipts.

Hosted verification passed for real Open Food Facts product lookup and search, atomic saves, exact retries, cross-account denial, captured nutrient calculations, deployed decoder/report assets and the mobile report flow. Health Connect export/reconciliation checks passed again, including snapshot numbers in recovery history. Disposable accounts and records were removed; the real owner workspace was unchanged. The publication audit passed for 1,084 files, 237 domain source modules and all report/barcode source and asset hashes. The implementation is saved in commit `c9fe64e` on `codex/appwrite-migration`. The production domain, installed APK and enabled background services remain unchanged.


## Diary tools, nutrient contributors and note photos — November 15, 2026

Preview `6af9696692007f0a68be` is active. Diary actions now include selection, copy/paste, clear amounts, group/time changes, deletion, reusable meals and entry ordering. Selection controls appear only when requested. Copied records retain source quantities and lineage; source validators reject stale selections and completed-day changes. Diary energy follows the account kcal/kJ setting.

Tapping an energy or macro value opens its contributing foods. Report details use the applied report filters and original averaging rules. Canonical nutrient facts, missing measurements, completed zero days and source attribution remain distinct. Note editing now supports camera/gallery attachments, preview, replacement and removal. The note and media mapping commit through the existing transaction and retry receipt. Removed images lose the app read route once no current note references them; private recovery retention remains in effect.

Validation: all 236 tests, the production build and 27 actual built-server request checks passed. Production-CSP mobile fixtures covered diary tools, a 300-record selection, failed-save retries, nutrient sheets, note photos and the existing barcode/record editors. Hosted checks passed for canonical kcal/account kJ, nutrient contributors, copy replay, reusable meals, ordering, clear amounts, normalized photo byte integrity, replacement/removal and account isolation. The deployed mobile diary displayed the private thumbnail, nutrient sheet and selection controls without script errors or horizontal overflow. Disposable accounts, rows and files were removed. The real owner workspace remained unchanged.

Publication audit covered 1,109 files and 241 domain source modules, with matching source hashes and no known credentials or owner identity. Production `nourishing.app`, the installed Android origin and background services remain unchanged. No new APK was built or installed in this increment.


## Account deletion and independent backup — November 15, 2026

Preview `6af9e66a8dd8246c822b` is active. Account deletion requires a fresh password and explicit confirmation. A private receipt tracks the job after sessions are revoked. The server blocks new account work, waits for active operations, removes owned rows and photos across generations, checks for remaining data, and deletes Auth last. Account identity includes its original creation timestamp. Unknown write outcomes stay unresolved for inspection rather than expiring on a timer. Profiles now use server-owned writes and owner-only reads.

The private cleanup Function deployment `6af9e85910fba8f41074` passed a live targeted deletion with no browser polling: 38 seeded rows and one photo, seven executions and 27 steps. Its public execution permissions are empty. The free-plan hourly interval is enabled; the normal empty-queue invocation passed. The first automatic timer execution is not yet observed. The separate fasting worker remains disabled.

A portable cloud backup was saved to the approved D: T7 drive and read back successfully. An isolated recovery restored 76 rows and three photos with matching contents, then removed its fixture. The original owner's workspace remained unchanged. This verifies recovery into an empty workspace before a new native identity is assigned, not arbitrary cross-account import. The Windows runner uses a current-user DPAPI credential and retains 14 verified daily archives. Its daily task is prepared but not installed: a durable key with only `rows.read` and `files.read` is still needed. The test used a temporary read-only key. The old PC backup remains intact.

Validation passed: 285 tests, production build, 48 built-server boundary checks, hosted deletion and account isolation, hosted signup/profile/logout/login, direct-client profile-write denial, and hosted Dashboard regression checks. All disposable resources were removed. The initial deletion verifier's cleanup assertion was corrected for completed ownerless receipts; exact receipt cleanup passed on retry. The registration verifier was corrected to expect the existing Strict session cookie; its complete rerun passed.

Only owner lifecycle metadata and profile permissions changed. Owner health data and catalog data were preserved. Production `nourishing.app`, the installed Android origin and APK remain unchanged. Final PC/cloud reconciliation and native-device checks are still required before cutover. Operational details are in `docs/account-lifecycle.md`.


## Automatic T7 backup activated — November 15, 2026

The supplied durable key was encrypted for the current Windows user and used to save a fresh verified cloud archive with three photos. The scheduled task is installed at limited privilege, daily at 09:00 Central and at logon with a 30-second delay. Missed starts run when available; overlapping runs are ignored. A real Task Scheduler invocation completed with exit code 0, current-archive verification and no warnings. The next run is November 16 at 09:00 Central. Retention is 14 verified daily copies. This supersedes the earlier pending-credential status.

The task requires the PC, signed-in Windows account and approved T7; it does not require the local app server. The credential, task configuration and verification report remain ignored local files. The supplied plaintext Downloads file was left unchanged. No app deployment or health-data mutation was required.

## PWA preview release — November 15, 2026

Commit `13a7e4f` is pushed to `codex/appwrite-migration`. Preview deployment `6afa3a48afec3e43fad4` is active. The user selected PWA delivery and removed Health Connect; native APK, Wear and native health integration are no longer release requirements. Previously imported records remain intact.

This release adds installation metadata and generated icons, a public offline screen, CSV import, favorites, source-derived nutrition-label entry, text/voice review with retained provenance, and explicit browser notification controls. Signing keys are persistent, stored as an Appwrite secret and in a Windows-account-encrypted local file. No Firebase project is required. Scheduled notification delivery remains paused; an actual device notification has not been verified.

Validation passed 336 local tests, production build, built-server boundary checks, mobile Chrome installation/cache/offline checks and hosted CSV/label/favorites/account-isolation checks. Hosted fixtures were removed and the owner workspace was unchanged. No production-domain switch has occurred.

Private fasting deployment `6afa37f29551f8a3afb1` passed an actual delayed-execution test: one fast at the canonical start, no duplicate on replay, and no remaining fixture. Function metadata remains disabled with interval zero and no public execute permissions. Its configured false flag requires a new deployment to replace the tested runtime’s captured true value; no real-owner dispatch is staged.

Remaining work follows MIGRATION.md: scheduled browser reminders, account-scoped offline edits, remaining source UI/features, data reconciliation, password-recovery/device checks and production cutover. Previous versions retain the source app’s indefinite retention policy; separate T7 archive rotation remains 14 days.


## PWA reminders and offline edits — 2026-11-15

- Scheduled Web Push preferences and editor are implemented. Diary writes, restores, CSV imports and device changes stage reminder intents atomically. Delivery uses private delayed executions and durable receipts; uncertain sends are not repeated automatically. New preferences remain paused until the user resumes them.
- The installable app has an optional account-specific offline diary. Saved-food additions and quantity edits, notes, water, exercise and measurement edits use a durable local queue. Replay checks the account and workspace generation, keeps original operation IDs and review revisions, and reports conflicts. Sign-out offers sync or explicit discard. Service-worker caching contains only public assets.
- Local integrated verification passed 374 tests, production build, built-server boundary checks and real Chrome installation/offline checks. Remaining offline UI differences are listed in `docs/offline-parity.md`. These changes are not yet in the hosted site release.
- Private schema additions are available: reminder dispatch, recent push history index and expired restore-review index. Cleanup deployment `6afa3d61f15fb8dccf67` passed disposable account deletion and expired-review live checks. Real owner records stayed unchanged; fixtures were removed.
- Approved-baseline, current-PC and cloud reminder comparisons each found zero schedules. No schedule migration was needed, and no PC notification keys or subscriptions were copied.
- Private reminder deployment `6afa3e3dddf46933b225` is ready with interval zero. Live delayed-execution verification is still in progress; visible device delivery is unverified. Production domain cutover remains pending.

## PWA completion validation — November 15, 2026

Preview deployment `6afa4087d9d1935e01e1` is active and supersedes the earlier undeployed status for offline edits and scheduled reminders. Hosted verification passed CSV/label/favorites, immutable offline replay, account/generation isolation, offline restart and queued water sync, public-only caches and mobile layout. Fixtures were removed and the owner workspace was unchanged.

Private reminder deployment `6afa3e3dddf46933b225` passed a delayed execution using an expired synthetic subscription; no real push was sent. It started 0.914 seconds after its scheduled time and completed in 11.23 seconds. Fasting deployment `6afa40f5cd8663f8ffd2` passed its stale-owner callback check. Both have private execution permissions and hourly repair enabled. Real-owner fasting dispatch and physical notification checks remain pending.

Read-only reconciliation verified the approved baseline digest, unchanged current PC state, all three cloud photo files and owner permissions, and matching nutrition totals for all three recorded dates. The cloud-only changes are the previously migrated historical import metadata. No owner data was overwritten.

The next local release adds the source local Coach, glucose/cycle Dashboard cards, chart settings and Dashboard pins, library JSON sharing, food printing and expanded offline controls. All 411 tests, production build, 62 built-server boundary checks and local Chrome PWA checks passed. The browser fixture now serves imported `.mjs` files with the correct JavaScript content type. Receipt-retention and cleanup changes passed 17 focused tests after removing the unnecessary push-transport dependency. The cleanup package now checks its entry imports before deployment. New features and receipt retention are not yet deployed at this checkpoint.

The cleanup index is pending: Appwrite accepts table-read delegation but rejects index-write delegation. A short-lived operator key with table-read and index-read/write scopes has been requested. The production domain remains unchanged. Remaining scope is listed at the top of MIGRATION.md; PWA delivery replaces the former APK requirement.

## Hosted feature release and calendar correction — November 15, 2026

Commit `a5b4b5b` is pushed. Preview `6afa496b200ae36f3d8d`, cleanup worker `6afa49bc882bbc7e4048` and reminder worker `6afa49c40ac8b80ce83e` are active. The supplied schema key created the `push_deliveries.created` index without changing table permissions. Both workers retain private execution permissions and hourly repair.

Hosted PWA checks passed again, including offline restart, queued water sync, account/generation isolation, CSV replay and public-only caching. A real cleanup invocation removed an expired synthetic receipt and preserved recent unknown and sending receipts. Fixture accounts were removed and the owner workspace remained unchanged. Owner fasting dispatch initialization also passed; no existing schedule requires an execution.

The additional hosted feature check verified Coach facts and preference isolation, then exposed a Charts calendar adapter error. The service passed a captured `asOf` string where the source projection requires a Date in `now`. The adapter now converts that value, consistent with the existing print/report adapters. A regression through the real HTTP handler, service, SDK transport and lifecycle gate reproduces the failure before the fix and passes after it. Seven focused chart/service/browser tests and the production build pass. The corrected site still needs deployment and a complete hosted feature rerun.

Preview `6afa4ba9214e34ae2c31` (commit `3497918`) is now active. The full hosted feature rerun passed Coach facts/preferences, chart settings and independent Dashboard pins, account isolation, library export/import replay, and account-bound styled food printing on mobile Chrome. Foreign library IDs return the same response as absent IDs. Test accounts were removed and the owner's workspace was unchanged.

Streak image sharing is ready locally. It reuses the source renderer and fonts, removes the Android bridge, and uses browser sharing with a PNG download fallback. Eight focused Dashboard/streak tests and the production build passed. The generated image was visually checked. This addition still needs preview deployment; an actual device share sheet remains unverified.

Preview `6afa4e7c0e4fc711d4cf` (commit `fd533d9`) now includes streak sharing and passes the full hosted feature check. The browser check now waits for the chosen Coach question to finish rendering before taking its screenshot. Disposable fixtures were removed; the owner workspace is unchanged.

Offline food/group selection and collapsed score, completeness and balance panels are implemented locally using existing source calculations, renderers and translations. Eighteen offline tests pass, including offline restart, queued writes, selection-only intake changes, full-day analysis, refresh/account reset and source visibility. Visual inspection also found malformed UTF-8 in the older offline shell's back arrow and status labels; those strings are corrected. The added panels still need preview deployment and a hosted check.

Preview `6afa50a18ff6012acd52` (commit `bee76cb`) is active. Its production build and hosted PWA check passed, including offline food selection/balances with unchanged daily scores/completeness, restart, queued water sync, label/CSV replay, account/generation isolation, public-only caches and mobile layout. The hosted screenshot was inspected. All disposable accounts were removed and the owner workspace digest is unchanged. `nourishing.app` still points to the earlier app.

Next source UI work: connect glucose source policy and timeline, detailed CGM target ranges/comparison/food markers/statistics, and reviewed cycle import/removal. Existing canonical modules already supply these projections and validations. The cloud calendar adapter must pass `{now: new Date(calendar.asOf), timeZone: calendar.timeZone}` to their captures. Cycle imports should use the existing owner-scoped command transaction and receipt with its workspace revision and source review token; the generic workspace codec already preserves `cycleRecords`. Physical PWA/email checks, final reconciliation and domain cutover remain afterward. Firebase is not required for browser push.

## Glucose and cycle controls — November 15, 2026

Implemented account-scoped glucose source/unit policy and the existing timeline renderer; CGM comparison, custom target ranges, food markers and source statistics; reviewed cycle import/removal with workspace revisions and retry receipts; and cycle diary visibility. Cycle phases remain restricted to recorded past dates, with source identities retained. Health Connect stays removed. Static source hashes are in `docs/health-ui-source.json`.

All 421 local tests and the production build pass. Mobile browser checks cover source settings, custom CGM ranges, comparison, food-marker details, statistics, import preview before mutation, removal cancellation/confirmation, late-response dismissal, and strict CSP. The real service/SDK adapter test verifies the account calendar for glucose and cycle views. Cloud deployment and live checks are next.

The hosted health check verified cycle import/retry/isolation and glucose controls, then failed at Charts during a fast tab switch. A direct SDK reproduction identified an Appwrite `transaction_conflict` followed by `transaction_not_ready` when our lifecycle gate tried to roll back an already ended transaction. The gate now retries that definite conflict without requiring a second rollback; unclassified conflicts with uncertain rollback still fail. The live SDK reproduction now passes overlapping Dashboard/Charts reads. HTTP errors no longer describe unrelated data conflicts as duplicate accounts, and Charts offers a retry instead of leaving a loading message. All 26 focused lifecycle, deletion, HTTP and chart browser tests and the production build pass. Preview deployment and full hosted health rerun remain next.

The production domain is parked and is not attached to either Appwrite project. The user authorized DNS changes in their signed-in Name.com account. Computer Use stopped before any DNS edits because it could not verify Chrome's URL; the user was asked to open the domain's Manage DNS screen. No DNS records have changed.

Preview `6afa59ffd5f0cb78a718` (commit `e964a61`) is active. The full hosted health check passed cycle preview/import/removal/replay, diary visibility, second-account isolation, glucose sources/units, CGM preferences/statistics and overlapping Dashboard/Charts requests. Screenshots were inspected. Eight diagnostic fixture accounts were removed, then all 336 residual synthetic workspace/profile/receipt rows were inventoried by their recorded owner IDs, deleted and checked absent. The health verifier now removes its workspace rows before deleting its accounts. The real owner's digest stayed unchanged.

The PWA hosted check passed with the owned PC startup task disabled and port 4288 confirmed absent before and after the test. It covered label/CSV/favorites, account/generation isolation, offline selection, restart, queued water sync, install assets and public-only caches. The local startup task was restored and the listener returned. Evidence is in ignored `.local/pwa-pc-independence.json` and `.local/pwa-cloud-verification.json`. This verifies server independence in desktop Chrome; installed-phone delivery remains unverified.

Appwrite now contains the external domain `nourishing.app` under the current organization, its active-site proxy rule, and the `nourishing-production` Auth web platform. The rule is unverified because public DNS still points to the parked address. Name.com supports ANAME at the apex; Appwrite's DNS metadata specifies `appwrite.network` and CAA `0 issue "certainly.com"`. Keep the Name.com nameservers and preserve unrelated records when applying the change. Site/reminder callback origins still use the preview and must change with the domain cutover. No registrar transfer, purchase or billing change occurred. README now describes the PWA scope and offline storage, replacing stale native/Health Connect instructions.

## Production domain and phone installation — November 15, 2026

The user saved a Name.com root ANAME to `appwrite.network`, TTL 300. DNS resolves to Appwrite, the domain rule is verified, and HTTPS was issued at 02:12 UTC on November 16 (November 15 Central). Correction to the earlier DNS note: CAA is optional when neither the domain nor its parent has a CAA record; Name.com's editor does not offer this type. No CAA or nameserver change was needed.

Site deployment `6afa66c178da0bd2af92` and reminder deployment `6afa66c9a0124814c583` were activated with `PUBLIC_ORIGIN=https://nourishing.app`. The reminder worker remains enabled, private and on its existing hourly repair interval. The site origin is stored as a secret variable and is masked by Appwrite's read API; its actual request behavior was verified. Production accepts same-origin authentication requests and the old preview rejects writes.

All three production-domain verification scripts passed: registration/private sessions/profile/login/logout/direct-write denial; PWA labels/CSV/favorites/account-generation isolation/offline restart/queued-water sync/install assets/public-only caching; and cycle/glucose/CGM controls with concurrent Dashboard/Charts reads. Disposable accounts and records were removed. Read-only reconciliation verified the baseline, all three photo files and nutrition totals on all three recorded dates; owner data was unchanged.

The owner confirmed Pixel PWA installation and diary access, but reported that the interface differs from the local app. Visual parity is incomplete: the cloud frontend retained some renderers but rebuilt the shell, Foods and Settings surfaces. This is an open migration gap, not a PWA platform limitation. A direct comparison of both apps is in progress. Password recovery is deferred by the user; installed-phone camera/barcode, notifications and offline checks remain pending.


## Cloud UI restoration follow-up

Initial source shell, Diary summary, Foods and More restoration shipped in revisions `25222f1` and `03c16d8`. The owner found remaining Add menu and Discover layout gaps. Revision `6c7a952` restores the colored Add to Diary sheet and saved menu preferences, Charts cards/manager/detail previews, Report rings/grouped nutrients/settings and Snapshots main cards. Revision `0e2a837` normalizes provenance hashes. Active Appwrite deployment: `6afa9a8c6e1c5f3b0cca` at https://nourishing.app.

Build, affected local browser flows and all 434 test cases passed (433 in the full run, then the corrected Coach Report selector test independently). Hosted acceptance passed with a temporary account, zero browser/HTTP/CSP errors and unchanged owner workspace; fixture cleanup completed. Header Newsfeed/settings actions were checked on Charts and Report. Phone inspection ended before deployment; final installed-Pixel verification is not claimed.

The Pixel disconnected before its original stay-awake setting could be restored. The user was told that Stay awake while charging remained enabled and can be disabled in Developer options. No further phone connection is needed for current source-based work.

Remaining UI and device checks are tracked in `docs/ui-parity.md`, including food search/entry, Photo Log review details, mixed Diary records and child editor layouts. Full visual parity is still incomplete.


## Food logging release — November 16, 2026

Deployment `6afaa0a216b486d21e89` is active at https://nourishing.app, runtime revision `33ac52db4584ad5ed336d2f5840ce3d674a8f3e2`. All 442 tests passed, the build passed, source asset hashes matched staged bytes, and the publication audit passed. Focused local browser tests cover the Photo Log summary, quantities, preview errors/retry and discard-on-close.

Hosted food checks passed category search (1,875 beverage matches), favorites, preview, add/reload/edit/delete, day completion, notes, dismissal, sign-out and phone-width overflow. Main-screen checks passed with no browser, HTTP or CSP errors. The owner workspace head remained unchanged; both disposable accounts and their records were removed. Food Search and entry screenshots were visually inspected. Evidence is retained in ignored `.local/diary-browser-verification.json`, `.local/ui-restoration-hosted/result.json` and their captures. These are desktop Chrome checks at phone width, not installed-Pixel verification.

Next increment: restore source multi-add for mixed foods, recipes and meals. Use a canonical preview plus one existing workspace transaction for all rows and the receipt. Keep catalog identity and quantities explicit, preserve account-scoped retry after uncertain saves, and enable multi-add only in the main Diary picker. Ingredient/Photo/Text pickers stay single-select. The original `food-multi-add.js` and `food-multi-add.mjs` provide the reference; no new schema, credential or phone is needed.


## Copy and Photo Log library release, November 16

Deployment `6afaa8bf3b6de9aec0ec`, revision `8f4f01cd5052d9f9ed5caf5c6f366c83932a2cb7`, is active. All 458 tests and the build passed; publication checks found no private artifacts or credentials and confirmed source hashes. Hosted copy checks passed cancellation with restored input, new custom-food creation, preserved source provenance/portions, original-food integrity, and no diary writes. Hosted Photo Log Create checks passed canonical meal/recipe quantities and yield, unknown nutrients, private source-photo access with second-account denial, and exact retry after a lost successful response. Recognition was replaced with signed synthetic evidence for this check; no Gemini call was made.

Both reports confirm unchanged owner data, no browser/CSP errors or horizontal overflow, and full fixture cleanup. Screenshots were inspected. The copy Cancel button still uses a default style in this deployed revision; a small CSS correction is staged for the next Diary release. Evidence: `.local/food-copy-hosted-result.json`, `.local/photo-create-hosted-result.json`. The previous main-screen release check also passed all navigation/header/settings checks after multi-add.


## Mixed Diary release, November 16

Deployment `6afaabce06903083a7a1`, runtime `a4dd7f57981e2480366e198e86880008c5f8634f`, is active. Notes, biometrics and foods share their display groups in the saved source order. Typed collection/id references keep selection and menus correct when record IDs coincide. Ungrouped records display in Uncategorized without rewriting stored groups. Source collapse state now has one owner and survives redraws. The food-copy Cancel button also uses the app styling.

All 461 tests, the build and the publication audit passed. The first full run exposed a Report test that used Playwright uncheck while deliberately causing a server error and immediate rollback; it now clicks and asserts rollback explicitly. Production Diary browser acceptance passed correct editors, Uncategorized selection, collapse persistence and unchanged totals; no browser/CSP errors or horizontal overflow. The live screenshot was inspected, the owner workspace was unchanged and the disposable fixture was removed. Evidence: `.local/mixed-diary-hosted-result.json`. This restores saved-source behavior; a same-state native mixed-record fixture was not captured.

The main production navigation regression also passed on this deployment: Diary summary/display/water, Add menu preferences and dismissal, Foods collections, More/system theme/Back focus/Account, and Discover headers, Newsfeed, Report, Charts and Snapshots. No browser, HTTP or CSP errors occurred; owner data was unchanged and the fixture was removed. Evidence: `.local/ui-restoration-hosted/result.json` at 07:10:58 UTC.


## Discover child-screen candidate, November 16

Runtime `1b1b4aa1dcadc67edd4da231d650f89851c3667c` restores one shared CGM detail controller for Charts and pinned Dashboard cards, including actual comparison plots, hour controls, target-range settings and help. Report restores the Remaining ring and source nutrient-detail hierarchy using canonical report averages. Snapshot restores Camera/Files, date calendar, caption/delete dialogs and the full-screen viewer while preserving other metadata.

All 463 tests and the build passed. An offline browser assertion was corrected to wait for the IndexedDB-backed redraw after changing dates; no offline implementation changed. Publication checks passed and 40 source asset/adapter hashes matched staged bytes after LF normalization. Deployment `6afaaf75b8d285c39483` is active; hosted Report/CGM and Snapshot acceptance passed. Physical camera checks remain separate.

Hosted Report/CGM checked the Remaining ring, canonical nutrient mean/source/help, real protein comparison values with shared glucose bounds, hour/target persistence, nested Back and plot disposal. Snapshot checked upload lost-response replay, metadata-preserving caption/date updates, cancel/outside/Back/navigation, and delete/media-access removal. Both checks recorded no browser/CSP errors or overflow, preserved the owner workspace and removed fixtures. Evidence: `.local/discover-details-hosted-result.json`, `.local/snapshot-child-hosted/result.json`. Live captures were inspected; Snapshot computed styles and rendered fonts match the source (Lato body and Karla headers); no typography correction was needed. Targets/Nutrient Targets and Create/Edit Custom Chart restoration are the next active increments.


## Targets and custom chart candidate — November 16

Restored the source Targets home and Nutrient Targets categories/cards/highlights, with canonical custom/reference modes and account-scoped writes. Other Targets destinations still reuse working cloud child editors. Restored Create/Edit Custom Chart with source metric tabs, search, units, optional second axis, fixed Save footer and transient drafts. Empty accounts now receive supported biometric choices. Existing chart identity, visibility, cycle state and date span are preserved. Ambiguous 5xx replies keep the same save request for retry.

All 468 tests and the production build passed. The Targets production-composition script passed nine checks, and source screenshots were inspected. Source/output hashes are recorded in docs/targets-source.json and docs/custom-chart-source.json. Live acceptance is pending deployment. The Foods audit confirmed remaining Suggest Food, Oracle, Repeat Items and custom-food child UI gaps; saved references are sufficient.


Hosted Targets and custom-chart acceptance passed on deployment `6afab31787c32ffd19d8` (runtime `e6f623d`). Targets custom/reference values, maximums, highlights, scores and nested navigation persisted correctly. Custom chart metric/unit choices worked in an empty account; an intentionally interrupted successful save retried the same receipt without duplication. Editing retained identity, secondary-axis removal persisted, Back discarded drafts, and confirmed deletion worked. Both fixtures were removed, owner data was unchanged, and no browser/CSP errors or overflow were observed. Live captures were inspected. The initial Targets script asserted a highlight change before the asynchronous save completed; it now waits for dialog closure and the refreshed highlight, and the matching local test passed. Evidence: `.local/targets-hosted-result.json`, `.local/custom-chart-hosted-result.json`.

## Foods restoration candidate, November 16, 2026

Suggest Food now uses the saved source filters, impact carousel, ingredient review and preference menus. Repeat Items uses the source list and Set Repeat editor. Custom Food uses the source label fields and serving editor, then a canonical nutrition review. Food preview and save share one server-owned draft conversion; portions and nutrient edits commit together.

The integrated suite passed 476 tests, the production build passed, and the final Suggest Food/Diary integration passed five checks. Saved source/output hashes accompany each restoration. Hosted acceptance and deployment are pending; the production runtime remains e6f623d until this candidate is activated. Next work is Oracle and generic chart detail, followed by the remaining target and fasting child editors.

Foods release `b70c0fc`, deployment `6afab6f5328fe200f7b0`, is active. All three hosted checks passed with temporary accounts and unchanged owner workspace. Suggest Food used the real catalog, edited amounts, reviewed nutrition and saved once after a committed 503 reply. Repeat Items persisted 75 g, disabled/enabled, removed timestamp and applied the expected 150 kcal once. Custom Food preserved 200 kcal, 7.8 g fat, zero fiber, absent sodium and a 100 g portion; an interrupted successful save created one food, and cancelling an edit preserved its saved name. All fixtures were removed; no browser/CSP errors or overflow. Reports: `.local/suggestions-hosted-result.json`, `.local/repeats-hosted-result.json`, `.local/custom-food-hosted-result.json`. The initial custom-food verifier used an incorrect button accessible name; its selector was corrected. A gray Add Serving Size button reset is prepared for the next release.

## Oracle, chart detail and expenditure candidate, November 16

Source Oracle, shared non-CGM chart detail and Energy Expenditure are implemented. The suite passes all 480 tests and the production build passes. Chart detail now fetches the current canonical card before enabling edits, fixing a reproduced stale-revision failure when reopening immediately after a save. Oracle separates committed writes from failed context refreshes. Publication checks passed 100 UI hashes, 260 domain files and the private-data scan. Deployment and hosted checks follow.


## Oracle, chart detail and expenditure acceptance — November 16

Deployment `6afabac7c4f4f02ce8c9`, runtime `9c483b1`, passed 480 local tests and the build. Hosted Oracle, Chart detail, Custom Chart and Energy Expenditure checks passed. Oracle preserves ranking quantities through diary save; Charts and Dashboard share current detail data; expenditure edits retain unrelated targets and schedules. Interrupted committed responses replayed identical receipts without duplicate writes. Owner workspace digests and timestamps were unchanged, temporary accounts were removed, and no browser/CSP errors or horizontal overflow occurred. Live screenshots were inspected. The custom-food Add Serving Size style reset is present in the live stylesheet.

Initial hosted failures were verifier defects: an ambiguous search label, missing required biometric fields/chart version, use of a command response instead of the canonical chart read, an incorrect Oracle density-column expectation, and a checkbox assertion that retried during a save redraw. Corrected checks passed without runtime changes. Evidence: ignored `.local/oracle-hosted-result.json`, `.local/chart-detail-hosted-result.json`, `.local/custom-chart-hosted-result.json`, `.local/expenditure-hosted-result.json` and their screenshots.


## Meal, Weight Goal and fasting acceptance — November 16

Deployment `6afabf363c43fbd91e57` (runtime `5b29b7a`) is active. All 488 tests, the production build and publication audit passed before deployment. Three hosted flows passed with disposable accounts: mixed Meal ingredients/reorder/cancel/review/Save & Add, inactive and active Weight Goal with the selected kg measurement, and fasting settings/schedules/history/repeat/delete. Interrupted committed replies retried identical requests without duplicate records. Owner workspace digests and timestamps stayed unchanged; fixtures were removed. No browser/CSP errors or horizontal overflow occurred. Live screenshots were inspected.

The hosted scripts needed navigation/fixture corrections: Meal Back returns through Search before the Foods page; Current Weight must wait for its save sheet to close and uses the explicitly selected body measurement. The empty-account case continues to show unknown weight rather than inventing a reading. These corrections did not change runtime behavior.

Evidence: ignored `.local/meal-editor-hosted-result.json`, `.local/weight-goal-hosted-result.json`, `.local/fasting-hosted-result.json` and associated PNG captures. Recipe editing/reviewed library edits and Macro & Energy are in the next working increment. Installed-phone and deferred recovery-email checks remain open.
