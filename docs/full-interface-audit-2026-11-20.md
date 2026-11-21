# Full interface audit — 20 November 2026

Baseline: master `060213cbe3448bde871b807ffe34cebe72fc2870`, PWA 1.0.13.

This audit replaces the broad coverage claims in the earlier parity audit. Version 1.0.13 fixed its listed issues, but did not establish that every screen or menu matched the reference. The Diary day menu and selection menu were missed. Functional tests were incorrectly used as a proxy for interface coverage.

## Evidence and completion rule

The reference archive is `Downloads/Cronometer Reference - 2026-11-20`: 333 retained screenshot/XML pairs. All 28 contact sheets have received an overview review. This is **not** a claim that 333 current-app states have passed comparison. Personal screenshots and extracted text stay outside Git.

Current visual checks use the actual frontend and canonical domain/view code in local browser fixtures with synthetic data. Recognition responses and the food catalog are fixtures. These checks do not establish production authentication, AI quality, camera permissions, notification delivery, or installed-device behavior. Different viewport scaling prevents a pixel-accurate comparison.

Each state needs separate evidence for layout/actions, navigation/dismissal, and applicable create/edit/cancel/delete behavior. Save flows also need immediate local results, persisted restart, delayed response, failure/retry, and no duplicate records. A screen is not complete because its parent tab exists or a unit test passes.

Status terms: **different** = observed mismatch; **missing** = reference action absent from implementation; **structure checked** = controls/layout inspected but behavior or exact styling remains unverified; **unverified** = no new current-state comparison; **excluded** = intentional scope exclusion.

## Confirmed findings

| ID | Priority | State and references | Finding | Evidence / work required |
| --- | --- | --- | --- | --- |
| D1 | High | Diary day menu, 56/216 | Corrected locally: nine-action bottom sheet, with Paste shown after Copy. Complete Day, Daily Report, widget sharing, sorting, previous-day copy and Delete All now have entry points. | Browser assertions cover all nine labels and sharing selection/preview/download. Full action journeys and installed-device checks remain open. Sharing follows the public guide; exact current widget graphics remain unverified. |
| D2 | High | Diary multi-select, 57–59/217–222 | Corrected locally: Multi Select Mode header, six-action overflow, whole-row selection, recipe creation and nutrition summary. | Browser checks cover mixed-row disabled actions, whole-row toggles, nutrition and recipe cancellation. Recipe/meal creation still uses a compact name/ingredient form; the complete staged editor remains a gap. |
| R4 | High | Diary bulk actions and selection creation | Local projections now cover copy, clear amounts, move group, timestamps, bulk delete, ordering, and creation of recipes/meals. Cached Foods lists derive from the same effective local state. | Canonical/local comparisons and real-queue browser checks cover lost acknowledgements, restart, identity reconciliation, and visible created recipes. This does not establish every CRUD journey. |
| R5 | High | Diary copy/clear/create selection | Released in 1.0.15: capture, copy, clear amounts, recipes and meals prepare from the device snapshot using shared canonical rules. | Focused real-queue tests pass for pending identities, lost replies, restart and source changes. All 646 local tests pass; CI passes 643 with three expected platform skips. Build, deployment and live assets verified. First launch without a snapshot still uses the server. Entry expansion and nutrition review remain separate network-bound paths. |
| D3 | Medium | Report, 133–143 | Different: long lists of source-specific nutrient variants appear by default, with repeated empty rows and extra coverage/detail text. | Browser + Report renderer. Retain source data, but show the concise user-facing nutrient set by default. |
| D4 | Medium | Report settings, 134–137 | Different: Days Displayed uses a native select rather than the reference choice screen. Extra More fold. | Browser. Date Range list exists; Custom Range currently uses two native date fields. |
| D5 | Medium | Dashboard summary, 324 | Different: missing inline period and adjustment icon; macro rows differ. | Browser. Cards exist, but card existence does not establish parity. |
| D6 | Medium | Create/edit recipe, 60–79 | Different: Import Recipe location, help/overflow controls, and edit options. | Browser first step/cooked weight; source. Remaining steps need direct comparison and CRUD. |
| D7 | Medium | Custom food, 252–263 | Different: no separate Nutrition Facts fold; extra fields/sections; header actions differ. Save & Add path needs verification. | Browser + `public/custom-food-editor.js`. |
| D8 | Medium | Create/edit meal, 223–241 | Different: overflow appears on new items; edit menu contains extra actions instead of the compact reference menu. | Source: `public/composite-editor.js`; current edit states remain visually unverified. |

| D9 | Medium | Diary group settings, 160/166–167 | Different: switch-and-Rename list instead of inline group fields. | Current group, subtotal and quick-add settings inspected. Imported-data controls require scope review because Health Connect is excluded. |
| D10 | Medium | Suggest Food overflow, 206 | Different: large technical settings dialog instead of compact Reset Filters menu. | Browser. Remove implementation details from the primary flow. |
| D11 | High | Water, 33–42 | Missing menu/settings: plus opens a generic amount editor; Add Glass, Add Custom Amount and Water Settings flow absent. | Browser and `public/diary.js`. Full-size references 33, 34 and 36 confirm an anchored Add Glass / Add Custom Amount / Water Settings menu, unit-aware custom amount sheet, visibility/group/target-bar settings, unit selector, goal wheel and container size. Current source hard-codes a 250 mL action and L totals. Full-size reference 35 also shows separate goals: 8/64 fl oz for water tracking and 8.0/125.1 fl oz for total nutrient water, eight glass controls with plus/minus, and a logged Water row in Uncategorized. Current source uses the nutrient target as the widget goal and has no glass row or separate total-water bar. References 41/42 show two glasses added and removed. Check settings persistence and exact removal behavior; do not infer all CRUD from those still images. |
| D12 | Medium | Suggest Food results, 207–214 | Different macro layout; removing an ingredient has no Undo. | Browser with one synthetic custom food. Quantity edit updates totals locally. Production suggestion quality not tested. |
| D13 | Medium | Oracle, 242–251 | Bottom navigation absent from current modal. | Main form, category/ranking controls, results and back paths inspected. Ranking semantics remain unverified. |
| D14 | Low | Repeat Items, 193–203 | Search placeholder displays mojibake; one serving displays as “1 servings”. | Browser. Local save appeared immediately; fixture sync failed because its command adapter omitted the catalog reader. This is not evidence of a production save failure. |
| R6 | Medium | Background sync notices | Repeated retries expose raw request errors and duplicate retry/storage actions. | Fixed locally: transient errors stay silent; blocked changes show one concise Review action. Details remain in storage. Browser recovery test passes. Released in 1.0.14. |
| D15 | Medium | Macro template editor, 186 | Different: missing overflow controls and a separate Units card below the editor. | Browser: Fixed and Ratios states, cancel return and scheduler options inspected. Scheduler structure is close to reference; create/update persistence remains unverified in this audit. |
| D16 | High | Nutrient Targets vitamin rows, 190–192 | Same underlying display issue as D3: source-specific variants precede the normal vitamin list. | Browser screenshot and catalog source. Both Reports and Targets need a shared default display set/order, with advanced source facts retained. |

| D17 | High | Diary group menu | Missing actions: current menu has Select Group, Copy, Clear Amounts and Order. The public reference guide also exposes timestamp, previous-day group copy, recipe/meal creation, quick-add default, nutrition and delete. | Source plus [Mobile: Edit Diary Entries](https://support.cronometer.com/hc/en-us/articles/360019003171-Mobile-Edit-Diary-Entries). Compare saved group-menu states before implementation; do not infer completion from the day-menu fix. |

### Local verification in progress

Bulk actions and selection creation now project into device state and reconcile canonical receipt identities. The cached Foods list uses that state so a new recipe remains visible after a lost server response and reload. Browser tests cover this path, mixed food/note/water copying, selection navigation, disabled actions, and local storage failure. R5 now has shared local preparation for capture/copy/clear/create, released and verified in 1.0.15. Installed-device verification remains open.

Transient sync errors stay silent; blocked changes have one concise Review action. Error details remain in Device storage. Tests cover retained pending changes, retry recovery and lost acknowledgements. Widget sharing follows the [public sharing guide](https://support.cronometer.com/hc/en-us/articles/21818099650836-Mobile-Social-Sharing), with local image generation and a tested image-download fallback. Native device sharing is not yet verified for the new Diary flow.

Additional inspected states: Profile sex/weight/height/body-fat pickers; Diary Settings folds/subtotals/quick-add; Note editor/photo chooser; Cardio exercise picker/effort; Suggest Food filters/results/quantity/remove; Oracle form/results/back; Repeat create/options/pending list. These are structure checks unless separately stated above, not complete journey passes.

Further checks: Macro & Energy fixed/advanced controls, Macro Scheduler list/options, new template Fixed/Ratio/cancel, missing-profile expenditure setup/cancel, Nutrient Targets categories/vitamin rows. The populated expenditure state remains unverified because this synthetic account has no profile. The local fixture command adapter now supplies its catalog reader; the earlier Repeat sync failure was fixture-specific. Background error banners were absent after loading the corrected fixture and current bundle.

Version 1.0.14 local verification: all 638 tests passed, and the production Astro build passed. [CI and all Appwrite deployments passed](https://github.com/liangzixuan/nourishing/actions/runs/44838292756) at release commit `ddc9098`. Live version metadata, sync handling, Diary menus and sharing assets match the verified source. The public update cache includes the new version and sync modules. Installed-device verification of this release remains open. The earlier failed runs exposed stale UI assertions and an expected provenance hash update after extracting shared image actions; affected tests then passed. These results establish the tested behavior, not complete interface parity.


## State coverage ledger

Ranges identify reference states, not a blanket pass. The local extracted inventory retains individual reference IDs and labels.

| Journey / references | Current comparison | Remaining checks |
| --- | --- | --- |
| Diary empty/populated/day menu, 1/4/56/216/335 | Day menu corrected locally: D1 | Date header, summary folds, groups, row actions, day status, all menu destinations |
| Diary multi-select, 57–59/215–222 | Header/actions corrected locally: D2 | Full reusable editors, each save action and device checks |
| Calendar, 303–304 | Unverified | Month navigation, legend, completed days, date return |
| Add to Diary, 2–3 | Structure checked | Edit/reorder/hide options, each destination and return |
| Biometrics, 5–23 | Grid and heart-rate editor structure checked | Category icons, all picker states, multi-value measurements, create/edit/delete, completed-day handling |
| Notes, 25–32 | Unverified | Text/photo/time/group, create/edit/cancel/delete |
| Water, 33–42 | Different: D11; full-size expanded widget and settings compared with current source | Implement and verify add glass/custom amount/settings, separate drinking/nutrient goals, units/container, visibility, persistence and removal |
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


### Local preparation follow-up (1.0.15, released)

The device snapshot now retains canonical recipe/meal metadata and diary record history. Shared review fingerprints sort object keys and omit private food notes, so serialization order does not create false conflicts. Food notes remain excluded from the snapshot; media bytes remain in separate storage.

A queued review retains its reviewed facts. After prior saves reconcile temporary identities, the queue verifies those facts and prepares its final fingerprint in the same IndexedDB transaction, before sending. A lost response retries that exact prepared payload. Changed source amounts, food facts or copy destinations still require review.

Focused browser checks cover an offline entry immediately used for recipe creation and copying, exact meal/copy retries after a lost acknowledgement, and copied pending records after identity reconciliation. Pure checks compare device-snapshot reviews to server reviews for mixed records and recipes with metadata/history. These checks do not establish all Diary CRUD or interface parity.

Validation: all 646 local tests passed after correcting a shared Repeat quantity import. The production Astro build passed. The real queue also verifies an editor saved after an earlier recipe acknowledgement; its receipt uses the canonical resource ID. [CI and all Appwrite deployments passed](https://github.com/liangzixuan/nourishing/actions/runs/44842051822) at release commit `94f3bd7`: 643 passed, zero failed, three expected Linux skips for Windows-specific checks. The first CI attempt timed out in the font-settings browser test. That test passed locally with CI coverage instrumentation, and the full failed-job retry passed without changing the tested commit. No product cause was established for that first timeout.

The live site reports 1.0.15. Public version, diary preparation, background writes, offline store, identity mapping and sync-notice files match the tested source. The service worker's `/offline-assets.js` includes the new preparation and version modules. Site, reminders, scheduler and account-cleanup deployments all reached ready. Installed-device verification remains open; these checks do not establish full interface parity.

### Water reference clarification

The [current mobile water guide](https://support.cronometer.com/hc/en-us/articles/18018883315988-Mobile-Water-Tracking), checked November 20, states that minus removes the newest water entry in full, including a custom amount. The total-water bar includes food and beverages and opens the nutrient target editor. This resolves the removal ambiguity left by references 35/41/42. It is documentation evidence, not a new device test. The saved screenshots remain the visual authority. No Water implementation change is claimed yet.
