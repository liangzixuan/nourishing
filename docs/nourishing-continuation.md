# Nourishing continuation

## Objective

Continue the full Nourishing PWA parity audit and implementation. Compare every in-scope screen, menu, picker, expanded/collapsed state, navigation path, and create/edit/cancel/delete flow with the saved Cronometer references. Fix save reliability first, then confirmed interface gaps. Keep an explicit evidence ledger. Do not treat passing tests or the presence of a tab as proof of UI parity.

The remaining audit continues from the release recorded below. Screen-level completion belongs in the evidence ledger.

## Repository and product

- Repository: `C:/Users/zixua/Documents/REA/nourishing-cloud`
- GitHub: `https://github.com/liangzixuan/nourishing`, branch `master`.
- Production: `https://nourishing.app`, Appwrite site and database, public account registration.
- Verified production release **1.1.23** at `ab24ddc2a2c3ab738d6831cfe79e9ed3f6dc290c`. All 720 local tests passed against the release commit. CI passed 717 and skipped 3. The site and three functions reached ready. All 226 checked production assets, 907 offline paths and 246 startup paths matched the clean build. [CI and deployment](https://github.com/liangzixuan/nourishing/actions/runs/44990482210)
- This is a PWA for Android and iOS. Health Connect and deliberately removed native integrations are excluded. Do not restart native APK work or use Azure.
- Product wording must say Nourishing, not Cronometer. Reference filenames and historical evidence can retain Cronometer.
- Preserve unrelated untracked `android/` and `docs/superpowers/`. Never stage them automatically.

## User decisions

- Instant local reads and changes, durable account-owned device storage, asynchronous background synchronization. Cache the signed-in account's data with account isolation.
- Do not show sync/conflict/review banners, repeated retry prompts, or technical storage explanations during ordinary use. Reconcile automatically. Keep uncertain/lost replies for idempotent retry. A permanent rejection must not block unrelated queued changes; the user accepts dropping an isolated irreconcilable change rather than asking them to resolve it.
- Do not fake a successful save when local persistence fails. Fix the producing boundary and its consumers instead of hiding the error.
- Dark theme by default; System follows the device. Keep headers/navigation fixed and Discover swipes responsive.
- Photo Log: selecting/capturing a photo starts recognition automatically with a scan animation; concise results; whole item opens editing; closing discards; default group Uncategorized unless explicitly selected. No Find Foods step or provider/allowance explanation.
- A Photo Log or Barcode save made during its signed review window can sync after expiry. Use the time recorded by the signed-in device when it durably saved the change.
- Restore Default Settings applies to Nutrient Targets. Keep separately owned macro, calorie and energy settings intact.
- Screenshots take precedence over manuals. Inspect real CRUD, menus, folds, back/outside dismissal, and blank/populated states.
- The user has given standing approval to push commits. This includes the repository’s normal CI and production deployment on master. Do not stop after each small step or repeatedly ask for confirmation. Ask only for genuinely missing information or user-only device actions. No mandatory external review/sign-off.
- The user does not prioritize backup work. Do not divert the parity goal into backup setup.

## Evidence to read first

1. `docs/full-interface-audit-2026-11-20.md`: current findings, state coverage, release evidence. This supersedes earlier broad parity claims.
2. `C:/Users/zixua/Downloads/Cronometer Reference - 2026-11-20`: 333 retained PNG/XML pairs. Reference numbers have gaps; do not infer count from the largest number.
3. `.local/full-parity/current-state-evidence.json` maps 333 pairs to their comparison evidence, with 840 capture links and 175 behavior records. Update these links as work proceeds. `.local/full-parity/inventory.json` and `.local/full-parity/references-01.png` through `references-28.png`: overview/index. An overview is not a per-state pass.
4. `.local/parity-audit/`: current-app comparison screenshots. `.local/full-parity-server.mjs`, `.local/parity-audit-server.mjs` and existing browser tests provide synthetic local fixtures.
5. Older user references/manuals: `C:/Users/zixua/Downloads/Cronometer Android App UI` and `C:/Users/zixua/Downloads/Cronometer Android App User Manual`.

Keep personal screenshots, extracted text, credentials and local evidence out of Git. Do not claim installed-phone verification from headless-browser fixtures. The phone need not remain connected unless a concrete remaining device check requires it; when using it, preserve and restore its previous awake setting.

## Current save reliability

- [Food corrections, bulk Diary deletion and empty libraries (1.1.23, released)](full-interface-audit-2026-11-20.md#food-corrections-bulk-diary-deletion-and-empty-libraries-1123-released)
- [Biometric editors, chart builder and preview footers (1.1.22, released)](full-interface-audit-2026-11-20.md#biometric-editors-chart-builder-and-preview-footers-1122-released)
- [Profile and Diary highlights (1.1.21, released)](full-interface-audit-2026-11-20.md#profile-and-diary-highlights-1121-released)
- [Biometric picker (1.1.20, released)](full-interface-audit-2026-11-20.md#biometric-picker-1120-released)
- [Diary Balance, biometric rows, food controls and review timing (1.1.19, released)](full-interface-audit-2026-11-20.md#diary-balance-biometric-rows-food-controls-and-review-timing-1119-released)
- [Repeat scanning, Fasting and reference screen repairs (1.1.18, released)](full-interface-audit-2026-11-20.md#repeat-scanning-fasting-and-reference-screen-repairs-1118-released)
- [Food headers, Walking, Report B1 and Photo Log (1.1.17, released)](full-interface-audit-2026-11-20.md#food-headers-walking-report-b1-and-photo-log-1117-released)
- [Pause Life, library deletion, day deletion and Photo Log (1.1.16, released)](full-interface-audit-2026-11-20.md#pause-life-library-deletion-day-deletion-and-photo-log-1116-released)
- [Fasting history, Repeat Items, Calendar and Snapshots (1.1.15, released)](full-interface-audit-2026-11-20.md#fasting-history-repeat-items-calendar-and-snapshots-1115-released)
- [Coach setup (1.1.14, released)](full-interface-audit-2026-11-20.md#coach-setup-1114-released)
- [iPad Home Screen checks (1.1.13)](full-interface-audit-2026-11-20.md#ipad-home-screen-checks-1113)
- [Pixel keyboard and New Food (1.1.13, released)](full-interface-audit-2026-11-20.md#pixel-keyboard-and-new-food-1113-released)
- [Notes, Android picker and General Walking (1.1.12, released)](full-interface-audit-2026-11-20.md#notes-and-general-walking-1112-released)
- [Printed barcodes and the Android keyboard (1.1.11, released)](full-interface-audit-2026-11-20.md#printed-barcodes-and-the-android-keyboard-1111-released)
- [Pixel camera, sharing and notifications (1.1.10, released)](full-interface-audit-2026-11-20.md#pixel-camera-sharing-and-notifications-1110-released)
- [Mobile Nutrition Facts names, fields and vitamin D (1.1.9, released)](full-interface-audit-2026-11-20.md#mobile-nutrition-facts-names-fields-and-vitamin-d-119-released)

- [Discover navigation, Nutrition Scores and Photo Log actions (1.1.8, released)](full-interface-audit-2026-11-20.md#discover-navigation-nutrition-scores-and-photo-log-actions-118-released)

- [Food and recipe serving controls, Diary columns and reminders (1.1.7, released)](full-interface-audit-2026-11-20.md#food-and-recipe-serving-controls-diary-columns-and-reminders-117-released)

- [Water, Report, Suggest Food and offline Diary preferences (1.1.6, released)](full-interface-audit-2026-11-20.md#water-report-suggest-food-and-offline-diary-preferences-116-released)

- 1.0.24 repaired offline meal expansion and its dependent record identities (R10). The expanded ingredients remain in the parent’s position after reload and a lost reply.
- 1.0.25 updated the custom-food editor and verified Save & Add to Diary before upload. It also updated Reports, Targets, Dashboard, Repeat Items, group settings, Suggest Food, Oracle and the Macro Scheduler.
- 1.0.26 covers fasting schedule creation, custom chart creation, snapshot photo capture and library deletion after an offline restart (R11–R13). Staged recipe and meal creation from Diary selection and groups also uses the local queue. See the audit for the source, exact tests, platform and limitations of each result.
- Original snapshot image bytes can include embedded metadata while the image is pending in the owner’s private device queue. Server preparation validates the source and strips metadata from the stored JPEG. Other accounts must never render or replay the queue.
- 1.0.27 moves PWA icon generation ahead of offline packaging and includes the app manifest and four PNGs in the startup cache. The disconnected Chrome regression reads the manifest and all four images.
- 1.0.28 repaired R14. A disconnected user can select a valid note image, preview it and save. The real editor regression follows the image through an account switch, offline restart, queued corrections and a lost response to one canonical attachment.
- 1.0.29 added durable saves for reviewed Multi-Add and Barcode changes. 1.0.30 also lets a user start Multi-Add review while disconnected using items available in the account snapshot. Signed provider review limits are recorded below.
- 1.0.30 repaired cold-cache Walking creation and reopening. The 1.0.31 saved editor uses the original weight, retains explicit calorie overrides and reconciles queued changes with the canonical exercise.
- 1.1.0 honors signed Photo Log and Barcode reviews at the stored device Save time and adds an offline Nutrient Targets reset. Adjust Meal now shows nutrition for the logged ingredients and retains the original template.
- 1.1.1 updates weekly chart axes and controls, custom chart pickers and manager navigation. Chart preferences preserve source units and previously captured cycle observations offline. The Adjust Meal and Nutrient Targets sheets have new visual comparisons. See the [1.1.1 audit](full-interface-audit-2026-11-20.md#111-chart-and-sheet-comparisons).
- 1.1.2 matches the captured Light and Moderate Walking estimates and restores the default Potassium Oracle search. The audit records the exact Walking calculations, catalog ranking comparison, historical entries and remaining source limits. [1.1.2 audit](full-interface-audit-2026-11-20.md#112-walking-and-oracle-comparisons)
- 1.1.3 adds chart units for fresh accounts, resolves previously unitless charts when exactly one measured unit is available, and adds three Single Metric sleep-stage choices. Adjust Meal exposes ingredient amounts and daily targets in the logged serving and account energy unit. [1.1.3 comparison](full-interface-audit-2026-11-20.md#113-chart-units-and-adjust-meal)
- 1.1.4 fits standard chart menus between the header and bottom navigation. Chart pinch, rotation, Android Back and Zoom to Fit were exercised on the physical Pixel. The installed production PWA was checked separately. [1.1.4 device evidence](full-interface-audit-2026-11-20.md#114-physical-device-chart-checks)
- 1.1.5 bounds concurrent background reads on a stale cache. [Incident and production verification](full-interface-audit-2026-11-20.md#repeat-items-and-background-cache-reads-115-released)
- A one-time fast scheduled offline can expire before the first upload. The server applies its existing time validation. The November 21 browser checks cover queued history changes, starts, stops and deletion.

## Remaining work

Choose the next work from the 333 reference states. Read each screenshot and its XML beside a current capture of the same state. Track visual differences, action behavior and unresolved dependencies separately. A linked capture can still show a mismatch. Reuse the Pixel and iPad evidence when it already answers the comparison. Use a physical device when the open question depends on its keyboard, camera, gestures, picker, or OS services.

Use the current follow-up and state-coverage tables in `docs/full-interface-audit-2026-11-20.md`. Keep individual screenshots and fixture output in `.local/`. The [333-state findings](full-interface-audit-2026-11-20.md#findings-from-all-333-retained-states) list the open interface gaps. The per-state notes are in `.local/full-parity/reference-review-1.1.15.json`. The verified 1.1.20 picker covers states 5–7. The production Profile and Diary highlight evidence for 151 and 335 is in `.local/profile-stage-121/` and `.local/highlights-335/`. The original range-deletion form and the production account comparison are in `.local/account-bulk-121/`. The production receipts for the biometric, chart and composite editors are in `.local/interface-122/production/`. The 1.1.23 production receipts for food corrections, range deletion and the empty libraries are in `.local/interface-123/production/`. The private index has 863 capture links and 184 behavior receipts. The 333-row worklist in `.local/state-worklist-123/` distinguishes historical screenshots, measured controls, source-only test links and production journeys. The archive contains 333 reference states. A range in the ledger identifies a journey, not a visual pass for each state.

1. R14 shipped in 1.0.28. Keep the original offline-editor reproducer and the tracked note attachment regression. They cover different behaviors.
2. All 333 reference pairs have linked captures with build or fixture labels. The private index has 840 capture links and 175 behavior records. The 1.1.1 table covers chart controls, graphs, the Nutrient Targets menu and Adjust Meal. The 1.1.2 table covers Walking estimates, the exercise grid and Oracle rankings. The 1.1.3 table covers chart unit selection, sleep stages and Adjust Meal nutrition details. The 1.1.4 table records physical Pixel chart layout, rotation and gestures. Android Chrome on a fresh API 36 emulator covered the final seven system picker references (266–271 and 293). Refs 269 and 271 use related system routes. Native picker layout varies by provider. The 1.1.10 Pixel checks cover rear-camera capture, picker cancellation, barcode torch and camera release, two native sharesheets, and push delivery and tap. The 1.1.11 checks cover two printed barcodes, catalog hit and miss, and the physical keyboard in manual entry. The 1.1.12 ledger adds the Note keyboard, Android Back and picker checks, local image editor handoff, and Walking estimates for Hard and Very Hard. Release 1.1.13 covers 22 physical keyboard fields and fixes first-tap entry between custom-food nutrients.
3. The [remaining evidence table](full-interface-audit-2026-11-20.md#evidence-still-needed-after-1120) records the outstanding device, source-data and product dependencies. Remaining differences include proprietary Oracle popularity weights and unavailable food listings, and the unpublished source precision behind the remaining Adjust Meal rounding and allocation differences. Profile, Support and About need product decisions for public policies, a private contact channel, community and video destinations. More → Support has a local mobile manual and a link labeled as a public GitHub issue tracker from 1.0.30 onward.
4. Photo Log and Barcode require a valid review when Save enters the account’s durable queue. Release 1.1.19 uses the time supplied by the review server and the elapsed time on the device to stamp the approval. The queued approval keeps that timestamp on late delivery and retry. A new Save at or after expiry needs a fresh review. Fresh provider lookup, recognition and uncached catalog rows still require connectivity.
5. Several reference screens show additional options tied to account data, paid services or platform controls. Keep them explicitly marked. Validate new work through the actual editor, account-owned local state and canonical receipt. Keep private evidence in `.local/`.

The recorded browser checks for the calendar, day menu, staged editors and snapshot restart are reusable starting points. Existing exercise references 81–84 belong to recipe cleanup. The Dashboard summary reference is 325, with an additional example at 102.

## Verification and release workflow

- `git -c safe.directory=C:/Users/zixua/Documents/REA/nourishing-cloud status --short`
- Inspect latest master and preserve unrelated work before pulling. Use GitHub `--repo liangzixuan/nourishing` explicitly.
- Focused source tests: `node --test tests/<file>.test.mjs`. Browser tests require Chrome; `tests/_chrome.mjs` chooses the executable. Network/browser execution may need sandbox escalation.
- Regenerate after source changes: `node scripts/package-diary-bundle.mjs`, `node scripts/package-diary-styles.mjs`. Some generated JS is ignored and rebuilt by CI. Do not hand-edit generated bundles.
- Full local gate used here: `node --test --test-concurrency=4 tests/*.test.mjs`, then `npm run build`. Bounded concurrency avoids local browser timing contention.
- Read actual exit codes and test totals. Browser fixtures may log missing synthetic warmup endpoints; inspect asserted failures instead of treating every fixture log as a live defect.
- CI workflow `.github/workflows/` tests/builds then deploys the Appwrite site and three functions. Verify the exact pushed SHA, final CI conclusion and ready deployments.
- Compare live version and asset hashes with the tested release, including generated Diary bundle and required offline manifest entries. Keep evidence in `.local/` and update the audit with what actually ran.
- Release 1.0.22: commit `6f6b1a89274ba7e8ee6cd910f440d2ac3fb93ba1`, CI run `44862310091`, success; 653 CI passes, three Linux skips; ten live asset hashes match. `.local/release-1.0.22-live-proof.json`.
- Release 1.0.23 evidence: `.local/release-1.0.23-tests.log`, `.local/release-1.0.23-build.log`, `.local/release-1.0.23-ci-final.log`, `.local/release-1.0.23-live-proof.json` (verified).

Do not repeatedly run a passing full suite without a new change or unresolved failure. Keep progress updates brief and evidence-based. Continue through a coherent verified release without asking the user to say next step.


## Handoff boundary

The deployed release and live asset proof are recorded above. Each reference pair now has a comparison. Continue from the individual mismatches and unverified behaviors in the current audit. The older proofs remain available for regression diagnosis.
