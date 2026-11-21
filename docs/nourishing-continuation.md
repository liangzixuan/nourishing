# Nourishing continuation

## Objective

Continue the full Nourishing PWA parity audit and implementation. Compare every in-scope screen, menu, picker, expanded/collapsed state, navigation path, and create/edit/cancel/delete flow with the saved Cronometer references. Fix save reliability first, then confirmed interface gaps. Keep an explicit evidence ledger. Do not treat passing tests or the presence of a tab as proof of UI parity.

The remaining audit continues from the release recorded below. Screen-level completion belongs in the evidence ledger.

## Repository and product

- Repository: `C:/Users/zixua/Documents/REA/nourishing-cloud`
- GitHub: `https://github.com/liangzixuan/nourishing`, branch `master`.
- Production: `https://nourishing.app`, Appwrite site and database, public account registration.
- Verified production release **1.1.0** at `e44ff9a6d8e3e733549d9a4ab42021e4b73edc19`. All 679 local tests passed. CI passed 676 tests with 3 Linux skips. The site and three functions reached ready. All 87 checked live assets matched the release build, along with the 885-path offline inventory and 232 startup paths. See [CI run 44880148001](https://github.com/liangzixuan/nourishing/actions/runs/44880148001) and `.local/release-1.1.0-live-proof.json`.
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
3. `.local/full-parity/current-state-evidence.json` maps 333 pairs to their comparison evidence, with 491 capture links and 30 separate behavior-evidence records. Update these links as work proceeds. `.local/full-parity/inventory.json` and `.local/full-parity/references-01.png` through `references-28.png`: overview/index. An overview is not a per-state pass.
4. `.local/parity-audit/`: current-app comparison screenshots. `.local/full-parity-server.mjs`, `.local/parity-audit-server.mjs` and existing browser tests provide synthetic local fixtures.
5. Older user references/manuals: `C:/Users/zixua/Downloads/Cronometer Android App UI` and `C:/Users/zixua/Downloads/Cronometer Android App User Manual`.

Keep personal screenshots, extracted text, credentials and local evidence out of Git. Do not claim installed-phone verification from headless-browser fixtures. The phone need not remain connected unless a concrete remaining device check requires it; when using it, preserve and restore its previous awake setting.

## Current save reliability

- 1.0.24 repaired offline meal expansion and its dependent record identities (R10). The expanded ingredients remain in the parent’s position after reload and a lost reply.
- 1.0.25 updated the custom-food editor and verified Save & Add to Diary before upload. It also updated Reports, Targets, Dashboard, Repeat Items, group settings, Suggest Food, Oracle and the Macro Scheduler.
- 1.0.26 covers fasting schedule creation, custom chart creation, snapshot photo capture and library deletion after an offline restart (R11–R13). Staged recipe and meal creation from Diary selection and groups also uses the local queue. See the audit for the source, exact tests, platform and limitations of each result.
- Original snapshot image bytes can include embedded metadata while the image is pending in the owner’s private device queue. Server preparation validates the source and strips metadata from the stored JPEG. Other accounts must never render or replay the queue.
- 1.0.27 moves PWA icon generation ahead of offline packaging and includes the app manifest and four PNGs in the startup cache. The disconnected Chrome regression reads the manifest and all four images.
- 1.0.28 repaired R14. A disconnected user can select a valid note image, preview it and save. The real editor regression follows the image through an account switch, offline restart, queued corrections and a lost response to one canonical attachment.
- 1.0.29 added durable saves for reviewed Multi-Add and Barcode changes. 1.0.30 also lets a user start Multi-Add review while disconnected using items available in the account snapshot. Signed provider review limits are recorded below.
- 1.0.30 repaired cold-cache Walking creation and reopening. The 1.0.31 saved editor uses the original weight, retains explicit calorie overrides and reconciles queued changes with the canonical exercise.
- 1.1.0 honors signed Photo Log and Barcode reviews at the stored device Save time and adds an offline Nutrient Targets reset. Adjust Meal now shows nutrition for the logged ingredients and retains the original template.
- A one-time fast scheduled offline can expire before the first upload. The server applies its existing time validation. The November 21 browser checks cover queued history changes, starts, stops and deletion.

## Remaining work

Use the current follow-up and state-coverage tables in `docs/full-interface-audit-2026-11-20.md`. Keep individual screenshots and fixture output in `.local/`. The archive contains 333 reference states. A range in the ledger identifies a journey, not a visual pass for each state.

1. R14 shipped in 1.0.28. Keep the original offline-editor reproducer and the tracked note attachment regression. They cover different behaviors.
2. All 333 reference pairs have linked captures with build or fixture labels. Read the November 21 and 1.1.0 comparison tables for layout findings and the separate behavior checks. Android Chrome on a fresh API 36 emulator covered the final seven system picker references (266–271 and 293). Refs 269 and 271 use related system routes. Native picker layout varies by provider. Physical-camera and installed-PWA results remain open.
3. Remaining differences include the Walking calorie formula, Oracle ranking, some chart-specific choices and graphs, and artwork, spacing and data coverage in Adjust Meal. Profile, Support and About need product decisions for public policies, a private contact channel, community and video destinations. More → Support has a local mobile manual and a link labeled as a public GitHub issue tracker from 1.0.30 onward.
4. Photo Log and Barcode require a valid review when Save enters the account’s durable queue. The 1.1.0 sender includes the original device save time on late first delivery and retry. Existing 1.0.31 pending rows already have that time. A new Save at or after expiry needs a fresh review. Fresh provider lookup, recognition and uncached catalog rows still require connectivity.
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
