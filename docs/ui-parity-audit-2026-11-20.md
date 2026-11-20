# Nourishing UI parity audit — 20 November 2026

Baseline: `master`, `c55fd4d61319f02a7fe499a2ad769258f3774304`, PWA 1.0.12.

## Release 1.0.13 closure

**Scope correction:** this release closed the issues listed below, not full interface parity. The Diary day menu and selection menu were missed. The [full interface audit](full-interface-audit-2026-11-20.md) records the expanded state coverage, new gaps, and remaining verification. Treat its explicit statuses as the current coverage record.

The confirmed gaps R1–R3 and G1–G9 below are implemented in version 1.0.13. The original findings describe version 1.0.12; they are retained as the comparison baseline. Local release validation is recorded at the end of this document. CI and deployment are tracked by the release workflow.

| Scope | Result | Verification |
| --- | --- | --- |
| R1–R2: save reliability | Replaced the closure queue with the existing account outbox. Persist before closing, replay stable requests, atomically reconcile record IDs, and retain failed work. Device storage exposes retry/export/discard. | IndexedDB failure, reload, lost reply, rapid add/edit/delete, expanded meals, account switching, malformed snapshots and restore-generation regressions. |
| R2: large photo saves | Lossless compression at the receipt storage boundary. Canonical replies and photo provenance are unchanged. | A 20-food photo reply exceeded the database text capacity before compression; its stored receipt is now about 3.2 KB. Online/offline, CSV and restore receipt readers share the codec. |
| R3: local editors | Display, Profile, chart preferences, Repeat Items, snapshot metadata, photo amounts, meal adjustments and suggested meals use local persistence/projection with background writes. | Delayed-network browser checks and local/server projection comparisons. Fresh Profile loads its initial snapshot once; subsequent opens use saved data. |
| G1: Report | Restored macro targets, highlighted targets, scores, nutrient groups and balance gauges with shared calculations and detail navigation. | Report and nutrient-detail tests, empty/partial values, units, filtering, expansion and narrow-layout captures. |
| G2: saved meals | Added original/copy, occurrence adjustment, explosion, summary, repeat and settings actions. | Original definition and other occurrences remain intact; expanded quantities and nutrition agree with the server. Exact post-save Edit Copy reference behavior was not captured. |
| G3–G4: Photo Log | Compact portion sheet, whole-card editing, favorite, local macro preview, camera/gallery choices, richer optional rows and direct Meal/Recipe creation. | Edit/cancel/close, persistent Add to Diary availability, named portions, source hydration, restart and prepared photo save/retry. Recognition itself uses fixture responses in these checks. |
| G5: Suggest Food | Direct Add to Diary, local ingredient previews, and matching filter labels. | Filter/carousel/ingredient/cancel/save flows and immutable retry. |
| G6–G7: settings and charts | Shared Dashboard Settings from Display; persistent chart navigation and instant chart preferences. | Shared setting projection, chart-specific controls, navigation and disposal tests. |
| G8: Repeat Items | Direct deletion and immediate local save/toggle/list updates. | Schedule, dismissal, retry and persisted result checks. |
| G9: one offline UI | Removed the separate offline editor. The normal diary opens from the saved account, including when the connection indicator is inaccurate. | Service-worker restart, seven queued food/note/exercise/measurement edits, reconnection, session locking and account isolation. |

Startup packaging retains the existing script-request and compressed-size budgets. The sync worker is bundled with the diary so it does not load a second module graph. Core cached interactions retain the existing sub-800 ms test budget under 1,500 ms API latency. Nourishing branding is retained; Health Connect and native-only integrations remain excluded.

This closes the confirmed implementation gaps, not every unobserved reference behavior. Live AI quality, physical camera/barcode/notification delivery, the post-disclaimer Coach flow, and pixel-for-pixel parity on both installed platforms were not newly established by this release's browser tests.

## Version 1.0.12 findings


At the baseline, the main gaps were report sections, saved-meal actions, compact photo editing and consistent local writes. The rows below record local closure evidence as implementation proceeds; full device and production-service parity is not established.

## Evidence and limits

- Compared the user's reference archive: 333 retained screenshot/XML pairs, indexed by capture number. Original files and personal data remain outside Git.
- Inspected the current frontend, HTTP adapters, domain operations, and recent commits. Captured current screens with the real frontend and production view/domain code against synthetic local data.
- The production page required authentication. This audit does not establish production-account behavior, live AI accuracy, camera behavior, or device notification delivery.
- Captures with different data or viewport sizes establish structure and available actions, not exact pixel alignment. A missing control was checked in source before being called a gap.
- Latest baseline CI/CD run succeeded: [run 44791787234](https://github.com/liangzixuan/nourishing/actions/runs/44791787234). Master pushes can deploy automatically; local edits below are not deployed.
- Local comparison gallery: `.local/parity-audit/index.html`. Original reference numbers below resolve through the archive's `index.json` and `index.html`.

## Recent work to preserve

The recent commits establish the intended direction: local diary views and food previews, IndexedDB food search, optimistic add/edit/delete, background refresh, date-scoped invalidation, adjacent-day warming, cached options, bundled startup assets, and explicit update checks in About. Retain these changes when closing gaps.

Do not restore network waits to make screen state easier to manage. A cached screen should render immediately. A valid edit should update the local view immediately and sync in the background. A failed save must remain recoverable without losing the user's change.

The tracked application, server, README, and docs contained no legacy product-name matches at the baseline. Keep Nourishing in all new user-facing labels and help text. Historical reference images remain unmodified evidence.

## Reliability gaps

### R1 — Background-save Retry throws an exception

**Observed, fixed locally.** `public/async-queue.js` called an undefined `enqueue` from the retry callback exposed to the UI. Invoking Retry produced `ReferenceError: enqueue is not defined`.

The callback now uses the queue's existing `enqueueWrite` entry point. `tests/async-queue.test.mjs` reproduced the failure before the fix and now verifies that the UI callback resubmits the original task, delivers its result, and drains the queue. This fix does not make the queue durable.

### R2 — Pending optimistic writes do not survive app termination

**Source-confirmed design gap; termination/data loss not reproduced on a device in this audit.** `public/async-queue.js` retains tasks as closures in a module array. A `beforeunload` warning is not persistent storage. The durable offline outbox in `public/offline-store.js` is a separate path; optimistic online writes do not automatically enter it.

**Required outcome:** one account-scoped, persistent command outbox for online and offline writes. Store serializable commands with stable request IDs before treating an edit as locally saved. Replay on startup/reconnect, overlay pending changes on cached views, and reconcile acknowledgements without duplicate records. Keep pending work on transient failures; make permanent failures editable or dismissible. Clear or isolate private data on account change.

**Acceptance:** add/edit/delete, immediately terminate and reopen, reconnect, and verify each command applies once. Also test lost acknowledgements, rapid edits to the same record, revision conflict, photo upload followed by save, and account switching. Reuse existing receipts and offline storage rather than creating a third queue.

### R3 — Several editors still wait for cloud work

**Source-confirmed.** The fast main diary path does not yet extend to all child screens:

| Flow | Current behavior | Owner |
| --- | --- | --- |
| Display settings | Closed locally: persisted local settings and canonical diary projection; no cloud acknowledgement or reload wait | `public/display.js`, `public/display-source/mobile-display.js` |
| Profile edits | Closed locally: initial account snapshot starts immediately and is shared with first Save; cached reopen and later edits use local state. Shared projections update targets and BMI before sync | `public/profile-editor.js`, `public/profile-local.js`, `public/device-sync.js` |
| Chart settings/detail | Closed locally: immediate controls and canonical local plots; queued preferences and visibility | `public/chart-detail.js`, `public/charts.js` |
| Repeat editor | Loads the item and waits for save/refresh | `public/repeats.js` |
| Snapshot metadata | Waits for command and reload; upload also blocks completion | `public/snapshots.js` |
| Photo portion editor | Always requests a library item; previews changes through the server | `public/photo-log.js` |
| Meal adjustments | Each preview uses a server request | `public/entry-adjustments.js` |
| Suggested meal | Separate save form waits for command and post-save refresh | `public/suggestions.js` |

**Acceptance:** render from existing account cache; calculate supported previews locally; apply local changes without waiting for a 1.5-second API response. Extend the existing responsiveness test to each row. Keep genuinely remote work, such as AI recognition and a new image upload, explicit without blocking unrelated navigation. Do not silently show stale data from another account or date.

## Visible and interaction gaps

| ID / priority | Confirmed gap | Evidence / implementation | Closure check |
| --- | --- | --- | --- |
| G1 / closed locally | Report now includes macro target bars, Highlighted Targets, Nutrition Scores, ordered nutrient groups and five balance gauges. Additional Nourishing balance outputs sit below the gauge grid. | Reference 133-143, especially 137/143; `public/report-mobile-source/report-sections.js`; `.local/report-targets.png`, `.local/report-balances.png` | `tests/discover-report-browser.test.mjs`: captured-period values, unknown values without needles, kJ conversion, score/balance details and retained expansion state. Local fixture coverage only. |
| G2 / high | Saved-meal context actions are missing: Edit Original Meal, Edit Copy, direct Adjust Meal, Explode Meal, Custom Meals Settings, and summary/repeat shortcuts. Current row menu is generic Edit/Select/Copy/Move/Delete. | Reference 231–236; `public/diary-tools.js` | Route by record type. Preserve original definition versus logged occurrence. Verify adjustments and explosion preserve portions and nutrients. `entry.expand` already exists in `server/domain/workspace.mjs`; expose it through the current command path. Adjustment already exists inside food detail, so reuse it. |
| G3 / high | Photo portion editing replaces the results with a sparse full-screen form. Reference uses a compact sheet with portion controls and an energy/macronutrient summary over the results. | Reference 275; current `12-photo-portion.jpg`; `public/photo-log.js:165` | Compact editor; local preview; Save/Cancel/outside dismissal return to the same result list. Keep whole-card editing, as requested by the user. Confirm Add to Diary remains usable after cancellation and after editing. |
| G4 / medium | Photo-result plus control opens only the gallery. Optional ingredient rows omit portion/macronutrient/replacement controls. The Create flow uses an extra selection dialog. | Reference 282–285; `public/photo-log.js` | Offer camera/gallery choices; use compact optional-food rows; show serving plus gram weight where known; direct Meal/Recipe choices. Keep automatic recognition, discard on close, and Uncategorized default. |
| G5 / high | Suggest Food still adds an extra Review & Add form before logging. Ingredient detail and save behavior are longer than the target flow. Some filter labels differ: Milk/Egg/Peanut/Snack versus Dairy/Eggs/Peanuts/Snacks. | Reference 204–215; `public/suggestions.js`, `public/suggestion-source/`; current filters/results/editor captures | One clear Add to Diary action from results, with accessible group/time controls and local ingredient updates. Preserve filters, carousel, removal, and useful added exclusions. Do not remove capabilities solely because a label differs. |
| G6 / closed locally | Display opens the shared Dashboard Settings component and returns to Display. Local settings persist before controls return; cloud writes run in the background. | Reference 155; `public/dashboard-settings.js`, `public/display.js` | `tests/display-browser.test.mjs`: shortcut, dashboard toggle, return navigation, local theme/energy/group changes, delayed writes, retry and conflict. |
| G7 / closed locally | Chart detail has persistent bottom navigation. Preferences and Manage Charts visibility use the shared chart producer over the account snapshot, then queue writes. | Reference 308/318; `public/chart-detail.js`, `public/charts.js`; `.local/chart-detail/custom.png` | `tests/charts-browser.test.mjs` and `tests/local-chart-projection.test.mjs`: energy/weight-specific controls, navigation, units/ranges, delayed-write response, cancellation, retry and validated cycle data. Without local chart data, the existing plot remains with a loading indicator. |
| G8 / medium | Repeat deletion adds a confirmation absent from the captured flow; save/load still interrupts interaction. | Reference 198–203; `public/repeats.js` | Match the captured options and direct deletion behavior with recovery where appropriate; update the list locally. Keep existing schedule/disable/retry behavior. |
| G9 / follow-up | More contains additional workspace/offline utilities. A separate offline diary experience conflicts with one continuous cached diary. | Current More; `public/offline-store.js` and diary entry points | Consolidate normal/offline editing through the same UI and outbox. Keep useful Nourishing-specific tools; do not copy reference omissions blindly. |

## Coverage by journey

“Present” means the implementation and listed local checks exist. It does not mean every visual detail matches or every live service was tested.

1. **Discover → Dashboard:** cards, settings and child flows are present. Check final spacing and all persisted preferences after R3. Reference 102–118 and 324–329. Coach inspection ends at its disclaimer; the complete post-disclaimer flow remains unverified.
2. **Discover -> Charts:** overview, built-in/custom charts, management and persistent detail navigation are present and tested. G7 and chart-preference R3 coverage are closed locally. Reference 119-132 and 305-318.
3. **Discover -> Report:** G1 is closed locally: target, score and balance sections join the existing range/day filters and nutrient details. Unknown values remain explicit. Reference 133-143.
4. **Discover → Snapshots:** upload, viewer, caption, date, delete and outside dismissal are present and tested. Metadata writes need R3. Reference 291–302.
5. **Diary and Add to Diary:** food entry, multi-add, selection, date navigation and local edits are present and tested. Saved-meal actions need G2. Reference 2–101, 219–241, 303–304 and 335.
6. **Photo Log:** automatic scanning, results, whole-card editing, cancel/discard and creation are present. G3/G4 and durable queued photo saves remain. This audit used synthetic recognition responses. Reference 265–290.
7. **Suggest Food:** filter/result/carousel/ingredient/options flows are present and tested. G5/R3 remain. Reference 204–222.
8. **Foods, custom foods, recipes and meals:** collection navigation, food editor formats, meal review and core operations are present. Reuse compact portion editors consistently. Imported recipes, sharing and every label-format combination still need targeted comparison; do not call these missing solely from incomplete coverage. Reference 60–84 and 219–263.
9. **Repeat Items:** schedule, edit, disable and retry are tested. G8/R3 remain. Reference 193–203.
10. **Oracle nutrient search:** filters, results and detail are present and tested. A final visual pass should use the same expanded/collapsed states. Reference 242–251.
11. **More -> Profile, Display, Account:** Profile and Display local edits and the shared Dashboard Settings shortcut are tested. Fresh online Profile loading and cached reopen are covered. G6 and these R3 rows are closed locally. Account authentication intentionally uses Appwrite. Reference 145-175.
12. **Targets and fasting:** target modes, macro scheduler, energy controls and fasting settings/history/retry are tested. Verify remaining live recurrence/notification effects separately. Reference 179–203 and prior fasting captures.
13. **Notifications, support and About:** current About includes the version/update check. Notification delivery, recovery email and account lifecycle completion were not retested here. Reference 176–178 and 320–323.
14. **Barcode and voice:** captured manual barcode paths can guide UI. Live scanning and voice require device/input coverage beyond this audit. Reference 330–334. Earlier successful user tests are not new evidence for this commit.

Newsfeed and Settings buttons are already present on Charts and Report. The earlier missing-header finding is closed. Do not re-add Health Connect, native-only integrations, or device-connect upsells excluded from Nourishing's scope. Browser camera/gallery selection is an accepted PWA platform difference.

## Implementation order and release checks

1. **Save reliability:** ship R1 after normal CI; implement R2 using the existing persistent storage and command receipts. Add termination/replay tests before converting more editors.
2. **Shared local editing:** complete R3 with shared local projections, pending overlays and cache invalidation. Avoid separate save/cache rules in every screen.
3. **Diary and photo actions:** implement G2–G4, then G5. Exercise create/read/edit/cancel/delete with actual temporary records, and clean them up.
4. **Report completeness and settings:** implement G1, G6–G8. Reuse existing calculations/settings owners, then verify exact captured states.
5. **Device parity pass:** compare Android and iOS installed PWA, dark/light/system theme, large text, first/rapid swipes, scroll-then-swipe headers, back/outside dismissal, and restart after an update. Check warm navigation and edits under latency/offline conditions. Keep data intact across reloads and account transitions.

For each change, keep the app working end to end and add a focused check for the behavior. Do not treat an empty-screen snapshot or a passing fixture test as proof of full parity. Reconcile older offline documentation with the unified implementation when R2 lands.

## Verification recorded

- Baseline: **18 passed**, zero failed across suggestions, photo log, snapshots, meals, charts, report, More/Profile, Oracle, repeats, Foods and responsiveness.
- Second batch: **16 passed**, zero failed across Display/Account, fasting, macros/scheduler/targets, custom foods, diary selection, multi-add, food entry and adjustments.
- Retry regression: failed with the exact undefined-function exception before the fix; passed after the fix.
- After fix: rebuilt the diary bundle; **3 passed**, zero failed across the new retry test and the two responsiveness tests. The responsiveness tests include 1,500 ms API latency.
- Total: **35 distinct passing tests**; two responsiveness tests were repeated after the fix. No full-suite run or production deployment was performed at that baseline audit stage.

### Report, Display, Charts and Profile closure checks

- Final scoped batch: **19 passed**, zero failed across Report, Charts, Display and Profile browser flows, profile command rules, and browser/server chart, diary and profile projection checks. The diary bundle built successfully.
- Follow-up Profile browser run: **2 passed** after removing fixture snapshot seeding. Open and Save share one initial snapshot request; Save closes before a held 1,500 ms command completes; cached reopen renders before a held profile refresh.
- Report screenshots show five primary gauges, a centered fifth gauge and separate additional balance outputs. Chart screenshot shows the styled five-item navigation. Captures use synthetic fixture data.
- Pending and acknowledged profile edits match canonical energy targets and BMI; acknowledged measurements use receipt IDs. The first online edit can wait for its initial account data, but subsequent local edits do not wait for cloud writes.


## Release validation

- Production build: `npm run build` passed after all production changes.
- Startup packaging and compressed bundle budgets passed. Core cached interactions passed the existing responsiveness check with 1,500 ms API latency.
- Reconnect coverage confirms that an unsaved food form stays open while seven queued changes sync. Account mismatch and session expiry still lock and clear private views.
- Complete suite after the Calendar correction: `node --test --test-concurrency=2 tests/*.test.mjs` passed **629 tests**, with zero failed, skipped or cancelled tests (234 seconds). Linux CI passed 626 tests and skipped the three Windows-only backup checks.
- Staged patch whitespace checks passed. Application sources contain no legacy product-name matches.
- The master-branch CI workflow repeats test/build checks before deploying the site and functions to Appwrite.
- The first CI run exposed stale Calendar marker visibility after a Display save. Calendar now shares its presence projection between server and local reads, including pending and acknowledged changes. The new hide/show regression, durable queue tests, Calendar rules and Display browser flow passed (8 tests); the production build passed again. CI repeats the full suite on this correction before deployment.
- Appwrite then exposed missing build scripts in the source upload allowlist. The upload now includes the four new projection packagers. CI installs dependencies and builds inside the exact staged upload directory; the same standalone staged build passed locally.
