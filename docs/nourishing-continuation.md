# Nourishing continuation

## Objective

Continue the full Nourishing PWA parity audit and implementation. Compare every in-scope screen, menu, picker, expanded/collapsed state, navigation path, and create/edit/cancel/delete flow with the saved Cronometer references. Fix save reliability first, then confirmed interface gaps. Keep an explicit evidence ledger. Do not treat passing tests or the presence of a tab as proof of UI parity.

The user asked to finish the current release and continue the remaining goal in a new chat. This handoff does not mark the overall goal complete.

## Repository and product

- Repository: `C:/Users/zixua/Documents/REA/nourishing-cloud`
- GitHub: `https://github.com/liangzixuan/nourishing`, branch `master`.
- Production: `https://nourishing.app`, Appwrite site and database, public account registration.
- Current release verification: pending for 1.0.23; replace this line after deployment.
- This is a PWA for Android and iOS. Health Connect and deliberately removed native integrations are excluded. Do not restart native APK work or use Azure.
- Product wording must say Nourishing, not Cronometer. Reference filenames and historical evidence can retain Cronometer.
- Preserve unrelated untracked `android/` and `docs/superpowers/`. Never stage them automatically.

## User decisions

- Instant local reads and changes, durable account-owned device storage, asynchronous background synchronization. Cache the signed-in account's data with account isolation.
- Do not show sync/conflict/review banners, repeated retry prompts, or technical storage explanations during ordinary use. Reconcile automatically. Keep uncertain/lost replies for idempotent retry. A permanent rejection must not block unrelated queued changes; the user accepts dropping an isolated irreconcilable change rather than asking them to resolve it.
- Do not fake a successful save when local persistence fails. Fix the producing boundary and its consumers instead of hiding the error.
- Dark theme by default; System follows the device. Keep headers/navigation fixed and Discover swipes responsive.
- Photo Log: selecting/capturing a photo starts recognition automatically with a scan animation; concise results; whole item opens editing; closing discards; default group Uncategorized unless explicitly selected. No Find Foods step or provider/allowance explanation.
- Screenshots take precedence over manuals. Inspect real CRUD, menus, folds, back/outside dismissal, and blank/populated states.
- The user has authorized normal implementation, tests, commits, pushes and CI deployment. Do not stop after each small step or repeatedly ask for confirmation. Ask only for genuinely missing information or user-only device actions. No mandatory external review/sign-off.
- The user does not prioritize backup work. Do not divert the parity goal into backup setup.

## Evidence to read first

1. `docs/full-interface-audit-2026-11-20.md`: current findings, state coverage, release evidence. This supersedes earlier broad parity claims.
2. `C:/Users/zixua/Downloads/Cronometer Reference - 2026-11-20`: 333 retained PNG/XML pairs. Reference numbers have gaps; do not infer count from the largest number.
3. `.local/full-parity/inventory.json` and `.local/full-parity/references-01.png` through `references-28.png`: overview/index. An overview is not a per-state pass.
4. `.local/parity-audit/`: current-app comparison screenshots. `.local/full-parity-server.mjs`, `.local/parity-audit-server.mjs` and existing browser tests provide synthetic local fixtures.
5. Older user references/manuals: `C:/Users/zixua/Downloads/Cronometer Android App UI` and `C:/Users/zixua/Downloads/Cronometer Android App User Manual`.

Keep personal screenshots, extracted text, credentials and local evidence out of Git. Do not claim installed-phone verification from headless-browser fixtures. The phone need not remain connected unless a concrete remaining device check requires it; when using it, preserve and restore its previous awake setting.

## Current save-reliability work

1.0.16 removed background review notices and implemented quiet retries/reconciliation. 1.0.19 made selected nutrition use local state. 1.0.20 fixed offline Diary restoration and pending selected IDs. 1.0.21 made food/recipe/meal editors prepare and save locally, with dependent ID reconciliation. 1.0.22 added separate Diary group selection/folding and left/right row swipe actions.

1.0.23 addresses R9:

- Pending notes, biometrics and exercise records stay editable.
- `server/domain/diary-record-update.mjs` owns current-record selection, validation and normalized edits. It is exported by `server/local-diary-projection.mjs` into the generated browser module. Local projection and canonical writes share it.
- `public/record-local.js` validates effective local state and queues `record.correct`; it no longer requires a snapshot review hash. The obsolete `prepareOfflineEdit` wrapper was removed.
- Canonical `record.correct` and `note.photo.save` no longer take `recordRevision`. The serialized workspace transaction applies each intent to the current record, preserving untouched metadata. Completed days and imported/source-owned edit restrictions remain.
- `server/workspace-commands.mjs` returns canonical updated rows for `record.correct`. This was necessary: omitted receipts left projection-only metadata in the snapshot and caused a later group-copy fingerprint mismatch.
- Record/note editors no longer lock into conflict/reload mode. Photo-note edits retain the photo and resolve temporary IDs after create acknowledgement.
- The older offline command protocol and its reviewed-record receipt readers still exist for other consumers. Do not confuse those retained modules with the current editor path. Removing the rest is a separate ownership/consumer audit, not permission to discard existing pending data.

Key tests: `tests/diary-group-browser.test.mjs`, `tests/records-browser.test.mjs`, `tests/note-editor-browser.test.mjs`, `tests/record-commands.test.mjs`, `tests/note-photos.test.mjs`. They use the real canonical store and browser queue. The group test covers two pending edits, restart, reconciliation, deletion, and subsequent mixed-record group actions. The photo-note test queues create plus two edits offline, restarts, loses the first reply and confirms one final attached note.

## Remaining work

Use the audit's finding IDs and coverage ledger. Do not mark these complete from this summary:

- Finish Diary state/action parity, including full staged recipe/meal editors from selections, exact group-sheet visuals, group-header gestures, calendar and all day-menu destinations. D1/D2/D17/D18 have released functional improvements but incomplete visual/device coverage.
- D3/D16: concise shared nutrient display set/order for Reports and Nutrient Targets; retain advanced source data outside the default list.
- D4: Report Days Displayed and date-filter choice screens.
- D5: Dashboard summary period/adjustment controls and macro rows.
- D6/D7/D8: recipe, custom-food and meal editor controls, stages, overflow menus, import placement and details. Save reliability was fixed; visual parity is still open.
- D9: inline Diary group settings.
- D10/D12: compact Suggest Food Reset Filters overflow, result macro layout and ingredient Undo.
- D13: Oracle navigation and ranking/form journeys.
- D14: Repeat Items text encoding and singular serving labels; complete CRUD comparison.
- D15: macro-template overflow and Units card.
- Unverified journeys include food search/details, fasting and recurrence/history, chart creation/detail options, snapshots, profile/display/targets submenus, Photo Log menus/undo/create/edit flows, scores, Coach/streak/news, barcode and About/support. Read the ledger for exact reference ranges.
- Some entry-expansion and first-launch-without-cache paths still use server preparation. Assess actual behavior before changing them.
- Production authentication, AI quality, camera permissions, installed-device gestures/share, notifications and offline launch require separate device evidence. Prior tests may exist, but this audit does not assume they pass every changed release.

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
- Release 1.0.23 evidence: `.local/release-1.0.23-tests.log`, `.local/release-1.0.23-build.log`, `.local/release-1.0.23-ci-final.log`, `.local/release-1.0.23-live-proof.json` once finalized.

Do not repeatedly run a passing full suite without a new change or unresolved failure. Keep progress updates brief and evidence-based. Continue through a coherent verified release without asking the user to say next step.
