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
| R5 | High | Diary copy/clear/create selection | Released in 1.0.15: capture, copy, clear amounts, recipes and meals prepare from the device snapshot using shared canonical rules. | Focused real-queue tests pass for pending identities, lost replies, restart and source changes. All 646 local tests pass; CI passes 643 with three expected platform skips. Build, deployment and live assets verified. First launch without a snapshot still uses the server. Entry expansion remains a separate network-bound path. Meal/group nutrition reads the local snapshot when its records are available. |
| D3 | Medium | Report, 133–143 | Different: long lists of source-specific nutrient variants appear by default, with repeated empty rows and extra coverage/detail text. | Browser + Report renderer. Retain source data, but show the concise user-facing nutrient set by default. |
| D4 | Medium | Report settings, 134–137 | Different: Days Displayed uses a native select rather than the reference choice screen. Extra More fold. | Browser. Date Range list exists; Custom Range currently uses two native date fields. |
| D5 | Medium | Dashboard summary, 324 | Different: missing inline period and adjustment icon; macro rows differ. | Browser. Cards exist, but card existence does not establish parity. |
| D6 | Medium | Create/edit recipe, 60–79 | Different: Import Recipe location, help/overflow controls, and edit options. | Browser first step/cooked weight; source. Remaining steps need direct comparison and CRUD. |
| D7 | Medium | Custom food, 252–263 | Different: no separate Nutrition Facts fold; extra fields/sections; header actions differ. Save & Add path needs verification. | Browser + `public/custom-food-editor.js`. |
| D8 | Medium | Create/edit meal, 223–241 | Different: overflow appears on new items; edit menu contains extra actions instead of the compact reference menu. | Source: `public/composite-editor.js`; current edit states remain visually unverified. |

| D9 | Medium | Diary group settings, 160/166–167 | Different: switch-and-Rename list instead of inline group fields. | Current group, subtotal and quick-add settings inspected. Imported-data controls require scope review because Health Connect is excluded. |
| D10 | Medium | Suggest Food overflow, 206 | Different: large technical settings dialog instead of compact Reset Filters menu. | Browser. Remove implementation details from the primary flow. |
| D11 | High | Water, 33–42 | Implemented locally: anchored add menu, compact custom amount sheet, settings, separate drinking goal and total-water target, glass controls and configured diary group. | Real-queue browser checks cover immediate additions, custom amount removal, restart, lost replies, settings persistence, More/Diary cache consistency, goal-wheel extension, Back/outside dismissal and completed-day controls. Rendered menu, custom amount, settings, group list and expanded widget compared with references. Existing water-row editing and installed-device behavior remain unverified in this pass. |
| D12 | Medium | Suggest Food results, 207–214 | Different macro layout; removing an ingredient has no Undo. | Browser with one synthetic custom food. Quantity edit updates totals locally. Production suggestion quality not tested. |
| D13 | Medium | Oracle, 242–251 | Bottom navigation absent from current modal. | Main form, category/ranking controls, results and back paths inspected. Ranking semantics remain unverified. |
| D14 | Low | Repeat Items, 193–203 | Search placeholder displays mojibake; one serving displays as “1 servings”. | Browser. Local save appeared immediately; fixture sync failed because its command adapter omitted the catalog reader. This is not evidence of a production save failure. |
| R6 | Medium | Background sync notices | Released in 1.0.16: review banners and per-change retry prompts removed. | Requests chain canonical revisions; uncertain replies retry the same identity/body, transient failures retry quietly, and final permanent rejections drop only that change. Real-queue tests and production assets verified. |
| D15 | Medium | Macro template editor, 186 | Different: missing overflow controls and a separate Units card below the editor. | Browser: Fixed and Ratios states, cancel return and scheduler options inspected. Scheduler structure is close to reference; create/update persistence remains unverified in this audit. |
| D16 | High | Nutrient Targets vitamin rows, 190–192 | Same underlying display issue as D3: source-specific variants precede the normal vitamin list. | Browser screenshot and catalog source. Both Reports and Targets need a shared default display set/order, with advanced source facts retained. |

| D17 | High | Diary group menu | Actions implemented locally: group timestamp, chronological sort, yesterday’s group copy, recipe/meal creation, quick-add default, copy/paste, nutrition and delete. Timestamps and sorting include mixed record types. Recipe/meal draft editor parity remains D2/D6; exact group-sheet visual and swipe affordances remain unverified. | Real browser queue/CRUD checks and shared-domain regressions; [Mobile: Diary Groups](https://support.cronometer.com/hc/en-us/articles/360019002571-Mobile-Diary-Groups). No saved XML group-action sheet was found, so action/behavior evidence comes from the current guide; the bottom-sheet and leading-icon pattern is supported by saved Android entry-menu reference 231; this is not proof of exact group-sheet parity. |

| D18 | High | Diary group selection and swipe | Missing: the group header currently toggles its fold; there is no selected-group state for the bottom Add menu. The source handler resets an unspecified group to the default. Group/record swipe affordances also remain unverified. | `mobileDiaryGroups` and `runAddAction`; the [current Diary Groups guide](https://support.cronometer.com/hc/en-us/articles/360019002571-Mobile-Diary-Groups) describes selecting a group before using the bottom Add button, with collapse as a separate control. Verify with the saved Android states before claiming parity. |

### Local verification in progress

Bulk actions and selection creation now project into device state and reconcile canonical receipt identities. The cached Foods list uses that state so a new recipe remains visible after a lost server response and reload. Browser tests cover this path, mixed food/note/water copying, selection navigation, disabled actions, and local storage failure. R5 now has shared local preparation for capture/copy/clear/create, released and verified in 1.0.15. Installed-device verification remains open.

Version 1.0.16 supersedes the earlier Review flow. Reconciliation and retries run without global or per-change review prompts. Tests cover retained transient failures, automatic reconciliation and lost acknowledgements. Widget sharing follows the [public sharing guide](https://support.cronometer.com/hc/en-us/articles/21818099650836-Mobile-Social-Sharing), with local image generation and a tested image-download fallback. Native device sharing is not yet verified for the new Diary flow.

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
| Water, 33–42 | Implemented and checked locally: D11 | Existing water-row editing and installed-device verification; exact icon artwork differs |
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

The [current mobile water guide](https://support.cronometer.com/hc/en-us/articles/18018883315988-Mobile-Water-Tracking), checked November 20, states that minus removes the newest water entry in full, including a custom amount. The total-water bar includes food and beverages and opens the nutrient target editor. This resolves the removal ambiguity left by references 35/41/42. It is documentation evidence, not a new device test. The saved screenshots remain the visual authority. Implementation and verification are recorded below.


### Automatic background reconciliation (1.0.16)

Release commit `9176c90` removes the global background-save review banner and per-change retry prompts. New queued requests now use the canonical snapshot revision, then the revision returned by each preceding save. The chosen request is persisted before sending; interrupted responses retry the exact body and operation ID. Existing blocked changes retry automatically. A final permanent rejection drops that change and continues the queue, following the product owner's explicit preference. Network failures and rate limits keep pending changes for background retry. Restored-generation edits are discarded without replay.

The rapid single-device regression sends 16 additions, edits and settings changes. Without revision chaining it makes 31 requests; with the fix it makes 16, retains all changes and leaves no pending commands. The full isolated release candidate passed 648 local tests and the production Astro build. The exact rejection previously seen on the user's device was not captured; these checks establish the stale-revision path and automatic reconciliation behavior.

The live site reports 1.0.16. Version, diary entrypoint, background writes, Device storage and core message assets match the tested release candidate. The removed sync-notice module returns 404 and is absent from the offline asset list. [GitHub CI and all Appwrite deployments passed](https://github.com/liangzixuan/nourishing/actions/runs/44847393307). The site, reminders, scheduler and account-cleanup deployments all reached ready. Installed-device confirmation remains unperformed. The broader interface audit remains open.


### Water controls and shared settings (1.0.17, released)

The Water widget uses its own drinking goal and container size. Its total-water bar retains the independent nutrient target. Add Glass and Add Custom Amount use the selected unit and diary group; minus removes the newest whole water entry. Hiding diary rows retains their nutrition. Water Settings is reachable from Diary and More → Display, including when the widget is hidden.

The custom amount sheet follows reference 34, with one amount row and the current unit. Back dismisses it without leaving Diary. The goal wheel extends its bounded set of rows as the user scrolls. A shared display projection now reads the effective local account state, preventing stale More settings after edits from Diary. The total-water target editor also saves through the durable background queue. Validation uses a copy of local state before enqueueing, so a failed local save cannot change the cached baseline.

All 651 local tests passed. A subsequent screenshot check exposed shared menu positioning/reset styles scoped only to Targets; those styles now belong to the shared AnchoredMenu stylesheet. Water, Targets and Display browser checks passed after that correction. Additional Water checks passed for completed-day disabled controls. Screenshots are retained locally under `.local/water/`; they are synthetic browser fixtures, not a new installed-phone inspection. The production Astro build passed. [CI and all Appwrite deployments passed](https://github.com/liangzixuan/nourishing/actions/runs/44850165755) at release commit `04b9f52`: 648 tests passed, zero failed, and three expected Linux skips. The site, reminders, scheduler and account-cleanup deployments reached ready. The live site reports 1.0.17; version, diary entrypoint, bundled CSS, Water, background writes, local diary projection and shared menu stylesheet match the tested source. The offline asset list includes the new Water modules, menu stylesheet and cup icon, and excludes the removed sync-notice module. Evidence is retained in `.local/release-1.0.17-live-proof.json`. Existing water-row editor and installed-device verification remain open. The broader audit stays open.


### Diary group actions (1.0.18, released)

The group sheet now exposes timestamp, sort, yesterday’s group copy, recipe/meal creation, quick-add settings, clipboard copy/paste, nutrition and deletion. The [Diary Groups guide](https://support.cronometer.com/hc/en-us/articles/360019002571-Mobile-Diary-Groups), updated November 3 and checked November 20, specifies that timestamps apply to all group entries and reusable foods use only the group’s food items. The timestamp command now accepts notes, biometrics and exercise while preserving atomic validation and completed-day checks. Shared record presentation applies chronological ordering across record types; it no longer leaves notes above earlier food entries.

The browser regression holds server saves, changes group settings and timestamps, copies yesterday’s group, then reloads before releasing the saves. It verifies the exact canonical records, quick-add preference, recipe and meal ingredients, cross-group clipboard paste, nutrition, empty-group behavior, completed-day controls, and deletion boundaries. A mixed group also exposed a local nutrition bug: exercise IDs were passed to the food-only nutrition calculation. That consumer now uses the canonical exercise classification, and its heading uses the existing translated message. Back and outside dismissal are checked. Screenshots are retained under `.local/diary-group/`. The current public guide uses an iOS popup; saved Android entry-menu reference 231 supports the bottom sheet and leading icons used here. New icons reuse the existing Pictogrammers license and theme filter.

All 654 local tests and the production Astro build passed. [CI and all Appwrite deployments passed](https://github.com/liangzixuan/nourishing/actions/runs/44852752341) at release commit `7d7300e`: 651 tests passed, zero failed, and three expected Linux skips. The site, reminders, scheduler and account-cleanup deployments reached ready. The live site reports 1.0.18. Its diary entrypoint, group tools, meal nutrition, bundled CSS and copy icon match that commit. The offline asset list contains all six new group icons and excludes the removed sync-notice module. Evidence is retained in `.local/release-1.0.18-live-proof.json`. The compact reusable-item name/preview form remains a separate editor gap. Exact group-sheet visuals, group swipe controls and installed-device confirmation remain open.


### Selected nutrition reads (1.0.19 candidate)

The selection summary still required a server round trip and rejected a whole-workspace revision change. Thus an unrelated save could interrupt a read on one device. The stale-revision regression reproduced that failure; the browser regression also failed when the nutrition endpoint was unavailable.

Selected totals now use the effective device snapshot, including pending edits. The Diary carousel and item/group nutrition sheets share the same reader and canonical calculation. A read without a device snapshot uses the server without requiring an unchanged revision. Transient failures retry in the background; the view has no error, review, retry or reload prompt. Leaving the view cancels its reads, listeners and retry timer. Nutrition-sheet refreshes preserve expanded sections.

Focused tests pass for canonical targets and mixed record types, offline selection, rapid changes, an offline amount edit reflected before upload, automatic uncached recovery after a failed response, and cancellation on navigation. The main cached browser scenario makes zero nutrition-review requests. All 654 local tests and the production Astro build passed. CI and live-release checks are pending. This fixes the selection-read path; it does not establish that every remaining editor uses local saves.
