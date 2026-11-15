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
