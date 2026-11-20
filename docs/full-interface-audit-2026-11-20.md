# Full interface audit — 20 November 2026

Baseline: master `060213cbe3448bde871b807ffe34cebe72fc2870`, PWA 1.0.13.

This audit replaces the broad coverage claims in the earlier parity audit. Version 1.0.13 fixed its listed issues, but did not establish that every screen or menu matched the reference. The Diary day menu and selection menu were missed. Functional tests were incorrectly used as a proxy for interface coverage.

## Evidence and completion rule

The reference archive is `Downloads/Cronometer Reference - 2026-11-20`: 333 retained screenshot/XML pairs. All 28 contact sheets have received an overview review. This is **not** a claim that 333 current-app states have passed comparison. Personal screenshots and extracted text stay outside Git.

Current visual checks use the actual frontend and canonical domain/view code at localhost port 4401 with synthetic data. Recognition responses and the food catalog are fixtures. These checks do not establish production authentication, AI quality, camera permissions, notification delivery, or installed-device behavior. Different viewport scaling prevents a pixel-accurate comparison.

Each state needs separate evidence for layout/actions, navigation/dismissal, and applicable create/edit/cancel/delete behavior. Save flows also need immediate local results, persisted restart, delayed response, failure/retry, and no duplicate records. A screen is not complete because its parent tab exists or a unit test passes.

Status terms: **different** = observed mismatch; **missing** = reference action absent from implementation; **structure checked** = controls/layout inspected but behavior or exact styling remains unverified; **unverified** = no new current-state comparison; **excluded** = intentional scope exclusion.

## Confirmed findings

| ID | Priority | State and references | Finding | Evidence / work required |
| --- | --- | --- | --- | --- |
| D1 | High | Diary day menu, 56/216 | Different: generic full-screen menu with eight actions instead of the nine-row bottom sheet. Complete Day, Daily Report, Share Diary Widgets, Copy Previous Day and Delete All are absent from this menu. | Browser + `public/diary-tools.js`. Preserve working commands and add the correct entry points; inspect sharing destination before implementing it. |
| D2 | High | Diary multi-select, 57–59/217–222 | Different/missing: selected-count card and chip toolbar replace Multi Select Mode header and overflow sheet. Recipe creation and selection nutrition are absent. | Browser + `public/diary-tools.js`. Check whole-row selection, exit, disabled actions and mixed record types. |
| R4 | High | Diary bulk actions | Missing immediate local projection for copy, clear amounts, move group, timestamps, bulk delete and ordering. Background queuing alone does not satisfy instant local updates. | Source: `public/write-projection.js`, `public/offline-model.js`. Reproduce and compare local effects with canonical commands, including receipt reconciliation. |
| R5 | High | Diary copy/clear/create selection | Reviews require a network request before progressing. | Source: `public/diary-tools.js`. Reuse canonical preparation over the local snapshot; retain stale-source protection. |
| D3 | Medium | Report, 133–143 | Different: long lists of source-specific nutrient variants appear by default, with repeated empty rows and extra coverage/detail text. | Browser + Report renderer. Retain source data, but show the concise user-facing nutrient set by default. |
| D4 | Medium | Report settings, 134–137 | Different: Days Displayed uses a native select rather than the reference choice screen. Extra More fold. | Browser. Date Range list exists; Custom Range currently uses two native date fields. |
| D5 | Medium | Dashboard summary, 324 | Different: missing inline period and adjustment icon; macro rows differ. | Browser. Cards exist, but card existence does not establish parity. |
| D6 | Medium | Create/edit recipe, 60–79 | Different: Import Recipe location, help/overflow controls, and edit options. | Browser first step/cooked weight; source. Remaining steps need direct comparison and CRUD. |
| D7 | Medium | Custom food, 252–263 | Different: no separate Nutrition Facts fold; extra fields/sections; header actions differ. Save & Add path needs verification. | Browser + `public/custom-food-editor.js`. |
| D8 | Medium | Create/edit meal, 223–241 | Different: overflow appears on new items; edit menu contains extra actions instead of the compact reference menu. | Source: `public/composite-editor.js`; current edit states remain visually unverified. |

| D9 | Medium | Diary group settings, 160/166–167 | Different: switch-and-Rename list instead of inline group fields. | Current group, subtotal and quick-add settings inspected. Imported-data controls require scope review because Health Connect is excluded. |
| D10 | Medium | Suggest Food overflow, 206 | Different: large technical settings dialog instead of compact Reset Filters menu. | Browser. Remove implementation details from the primary flow. |
| D11 | High | Water, 33–42 | Missing menu/settings: plus opens a generic amount editor; Add Glass, Add Custom Amount and Water Settings flow absent. | Browser and `public/diary.js`. Check expanded widget and settings persistence. |
| D12 | Medium | Suggest Food results, 207–214 | Different macro layout; removing an ingredient has no Undo. | Browser with one synthetic custom food. Quantity edit updates totals locally. Production suggestion quality not tested. |
| D13 | Medium | Oracle, 242–251 | Bottom navigation absent from current modal. | Main form, category/ranking controls, results and back paths inspected. Ranking semantics remain unverified. |
| D14 | Low | Repeat Items, 193–203 | Search placeholder displays mojibake; one serving displays as “1 servings”. | Browser. Local save appeared immediately; fixture sync failed because its command adapter omitted the catalog reader. This is not evidence of a production save failure. |
| R6 | Medium | Background sync notices | Repeated retries expose raw request errors and duplicate retry/storage actions. | Fixed locally: transient errors stay silent; blocked changes show one concise Review action. Details remain in storage. Browser recovery test passes. Not released. |
| D15 | Medium | Macro template editor, 186 | Different: missing overflow controls and a separate Units card below the editor. | Browser: Fixed and Ratios states, cancel return and scheduler options inspected. Scheduler structure is close to reference; create/update persistence remains unverified in this audit. |
| D16 | High | Nutrient Targets vitamin rows, 190–192 | Same underlying display issue as D3: source-specific variants precede the normal vitamin list. | Browser screenshot and catalog source. Both Reports and Targets need a shared default display set/order, with advanced source facts retained. |

### Local verification in progress

Bulk move, timestamp, delete, clear-amount and global/group ordering now project into the retained local state for both pending and acknowledged writes. Copy now shares record-shaping rules with the canonical save and receives canonical record IDs in its receipt. A real-queue browser regression passed for mixed food/note/water copy, immediate edit/delete, lost acknowledgement, restart and identity reconciliation. Selection creation and network-bound preparation remain open; this does not close R4/R5.

After the sync-notice change, 12 focused tests passed across background-write browser tests, bulk projection tests and food-entry browser tests. They cover retry silence, one blocked-change review action, recovery, retained pending changes, lost acknowledgements, restore protection and visible local-storage failure. No release or production-device verification has occurred for these changes.

Additional inspected states: Profile sex/weight/height/body-fat pickers; Diary Settings folds/subtotals/quick-add; Note editor/photo chooser; Cardio exercise picker/effort; Suggest Food filters/results/quantity/remove; Oracle form/results/back; Repeat create/options/pending list. These are structure checks unless separately stated above, not complete journey passes.

Further checks: Macro & Energy fixed/advanced controls, Macro Scheduler list/options, new template Fixed/Ratio/cancel, missing-profile expenditure setup/cancel, Nutrient Targets categories/vitamin rows. The populated expenditure state remains unverified because this synthetic account has no profile. The local fixture command adapter now supplies its catalog reader; the earlier Repeat sync failure was fixture-specific. Background error banners were absent after loading the corrected fixture and current bundle.

The full local suite ran 634 tests: 632 passed and two browser tests still expected the removed retry banners. Those tests now verify the Review route for a blocked setting and silent automatic retry for a lost reply; both passed on rerun. The production Astro build passed. CI/deployment is not yet performed for this working set.

## State coverage ledger

Ranges identify reference states, not a blanket pass. The local extracted inventory retains individual reference IDs and labels.

| Journey / references | Current comparison | Remaining checks |
| --- | --- | --- |
| Diary empty/populated/day menu, 1/4/56/216/335 | Different: D1 | Date header, summary folds, groups, row actions, day status, all menu destinations |
| Diary multi-select, 57–59/215–222 | Different/missing: D2 | Each selection action, mixed rows, whole-row toggle, cancellation |
| Calendar, 303–304 | Unverified | Month navigation, legend, completed days, date return |
| Add to Diary, 2–3 | Structure checked | Edit/reorder/hide options, each destination and return |
| Biometrics, 5–23 | Grid and heart-rate editor structure checked | Category icons, all picker states, multi-value measurements, create/edit/delete, completed-day handling |
| Notes, 25–32 | Unverified | Text/photo/time/group, create/edit/cancel/delete |
| Water, 33–42 | Unverified | Add glass/custom amount/settings, units/goals/container, persistence |
| Food search/detail/options, 43–55 | Unverified | Tabs, sorting, multi-add, serving, details, options menus and CRUD |
| Recipe editor, 60–79 | Different: D6 | All four stages, import, ingredients, serving basis, advanced controls, category, review, edit/delete |
| Exercise, 80–94 | Unverified | Category list, effort/duration/energy/group, create/edit/delete |
| Fasting, 95–118 | Unverified | Schedule, repeat, start/stop, expanded sections, history, edit/delete |
| Charts overview/create/manage, 119–132 | Overview structure checked | All custom chart steps, axis choices, editing/deletion and persisted visibility |
| Report/settings/details, 133–143 | Different: D3/D4 | All folds, nutrient detail edits, balances, days and date filters |
| Snapshots/news empty states, 144–146 | Unverified | Source chooser, empty/news menus and settings |
| More/Profile/Display/Account, 147–178 | More/Profile list and birthday wheel structure checked | Remaining profile pickers, display submenus, account return/cache, notifications |
| Targets, 179–192 | Unverified | All macro modes, schedule, energy, nutrient controls and save/cancel |
| Repeat Items, 193–203 | Unverified in this pass | Create/edit/toggle/menu/delete and local-first persistence |
| Suggest Food, 204–214 | Unverified in this pass | Filters/reset, carousel, ingredients, remove/undo, add, local saves |
| Meals, 223–241 | Source difference: D8 | Full current visual and CRUD comparison |
| Oracle, 242–251 | Unverified | Form, overflow, nutrient/category selection, sort/results/detail |
| Custom Food, 252–263 | Different: D7 | All label profiles, serving controls, review/save/add/edit/delete |
| Photo Log, 264–290 | Unverified in this pass | Capture/scan/results, amount editing, replacement choices, suggestions/undo, create menu, add photo, save/discard |
| Snapshots CRUD, 291–302 | Unverified | Upload/date/caption/viewer/menu/delete and background persistence |
| Chart detail controls, 305–318 | Calories detail and date menu structure checked | Weight metric/unit, include today, zoom, fasts, dashboard toggles and return |
| About/Support, 319–321 | Unverified | Version, links, support destinations; no reference branding in product copy |
| Scores, 322–323 | Unverified | Settings, selection, detail and local updates |
| Dashboard/Coach/Streak, 324–329 | Dashboard difference: D5 | All card menus, Coach preferences, Streak sharing; post-disclaimer Coach behavior not captured |
| Barcode, 330–334 | Unverified in this pass | Camera controls, manual entry, found/not-found, entry return |

## Scope exclusions

Health Connect and deliberately removed native integrations remain excluded. OS-owned camera/gallery and browser permission screens need platform usability checks, not an imitation inside the PWA. Account authentication uses Appwrite. Nourishing-specific device storage, import/export and recovery tools remain useful additions; their presence alone is not a parity defect. Do not reproduce third-party branding.

## Work order

1. Finish per-state comparison and record newly found gaps explicitly.
2. Fix bulk save projection and local preparation, with canonical local/server regressions.
3. Correct Diary menus, selection and related navigation.
4. Correct remaining confirmed interface gaps by journey; verify each changed state and CRUD path.
5. Run the relevant gates, then CI/deployment and installed PWA checks. Do not label the release comprehensive while required states remain unverified.
