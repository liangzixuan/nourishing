# Full interface audit — 20 November 2026

Baseline: master `060213cbe3448bde871b807ffe34cebe72fc2870`, PWA 1.0.13.

This audit replaces the broad coverage claims in the earlier parity audit. Version 1.0.13 fixed its listed issues, but did not establish that every screen or menu matched the reference. The Diary day menu and selection menu were missed. Functional tests were incorrectly used as a proxy for interface coverage.

## Evidence and completion rule

The reference archive is `Downloads/Cronometer Reference - 2026-11-20`: 333 retained screenshot/XML pairs. All 28 contact sheets have received an overview review. This is **not** a claim that 333 current-app states have passed comparison. Personal screenshots and extracted text stay outside Git.

Current visual checks use the actual frontend and canonical domain/view code in local browser fixtures with synthetic data. Recognition responses and the food catalog are fixtures. These checks do not establish production authentication, AI quality, camera permissions, notification delivery, or installed-device behavior. Different viewport scaling prevents a pixel-accurate comparison.

Each state needs separate evidence for layout/actions, navigation/dismissal, and applicable create/edit/cancel/delete behavior. Save flows also need immediate local results, persisted restart, delayed response, failure/retry, and no duplicate records. A screen is not complete because its parent tab exists or a unit test passes.

Status terms: **different** = observed mismatch; **missing** = reference action absent from implementation; **structure checked** = controls/layout inspected but behavior or exact styling remains unverified; **unverified** = no new current-state comparison; **excluded** = intentional scope exclusion.

## Confirmed findings

The table records the original findings. The [follow-up comparisons](#november-20-follow-up-comparisons) record the latest evidence for each changed screen.

| ID | Priority | State and references | Finding | Evidence / work required |
| --- | --- | --- | --- | --- |
| D1 | High | Diary day menu, 56/216 | Corrected locally: nine-action bottom sheet, with Paste shown after Copy. Complete Day, Daily Report, widget sharing, sorting, previous-day copy and Delete All now have entry points. | Browser assertions cover all nine labels and sharing selection/preview/download. Full action journeys and installed-device checks remain open. Sharing follows the public guide; exact current widget graphics remain unverified. |
| D2 | High | Diary multi-select, 57–59/217–222 | Corrected locally: Multi Select Mode header, six-action overflow, whole-row selection, recipe creation and nutrition summary. | Browser checks cover mixed-row disabled actions, whole-row toggles, nutrition and recipe cancellation. Recipe/meal creation still uses a compact name/ingredient form; the complete staged editor remains a gap. |
| R4 | High | Diary bulk actions and selection creation | Local projections now cover copy, clear amounts, move group, timestamps, bulk delete, ordering, and creation of recipes/meals. Cached Foods lists derive from the same effective local state. | Canonical/local comparisons and real-queue browser checks cover lost acknowledgements, restart, identity reconciliation, and visible created recipes. This does not establish every CRUD journey. |
| R5 | High | Diary copy/clear/create selection | Released in 1.0.15: capture, copy, clear amounts, recipes and meals prepare from the device snapshot using shared canonical rules. | Focused real-queue tests pass for pending identities, lost replies, restart and source changes. All 646 local tests pass; CI passes 643 with three expected platform skips. Build, deployment and live assets verified. First launch without a snapshot still uses the server. Entry expansion remains a separate network-bound path. Meal/group nutrition reads the local snapshot when its records are available. |
| D3 | Medium | Report, 133–143 | Different: long lists of source-specific nutrient variants appear by default, with repeated empty rows and extra coverage/detail text. | Browser + Report renderer. Retain source data, but show the concise user-facing nutrient set by default. |
| D4 | Medium | Report settings, 134–137 | Different: Days Displayed uses a native select rather than the reference choice screen. Extra More fold. | Browser. Date Range list exists; Custom Range currently uses two native date fields. |
| D5 | Medium | Dashboard summary, 102/325 | Different: missing inline period and adjustment icon; macro rows differ. | Browser. Cards exist, but card existence does not establish parity. |
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

| D18 | High | Diary group selection and swipe | Implemented locally: group names select the destination for the bottom Add menu; a separate arrow folds the group. A right swipe reveals options and a left swipe reveals Delete, followed by confirmation. Completed days do not expose swipe deletion; multi-select keeps whole-row selection. | Saved Android references 20/21/230 and rendered browser screenshots. Real touch tests cover both directions, vertical scrolling, interruption, confirmation dismissal, and deleting a pending note through the canonical queue. Group-header swipe behavior and installed-device confirmation remain unverified. |
| R7 | High | Diary selected nutrition | Released in 1.0.19: reads use pending local state and no longer reject a whole-workspace revision change. | Browser checks cover offline selection/edit, zero nutrition-review requests with a snapshot, uncached retry recovery and cancellation. See release evidence below. |
| R8 | High | Custom food, recipe and meal editor saves | Implemented in 1.0.21: shared local preparation and durable saves replace direct edit-preview/command requests and conflict/reload controls. | All three editors use local previews and queued saves. Browser checks cover offline food → recipe → meal → diary creation, an edit before upload, restart, a lost reply, canonical identity reconciliation and no duplicates. Installed-device checks remain open. |
| R9 | High | Pending note, biometric and exercise edits | Reproduced and fixed locally: pending records remain editable. Ordered edits apply to the latest record without a stale per-record review token. A shared parser validates local and canonical changes. | Real-browser checks cover repeated note, biometric, exercise and photo-note edits, offline restart, lost replies and canonical receipts. Released in 1.0.23; CI, site/functions and ten live asset hashes verified. |

### Local verification in progress

Bulk actions and selection creation now project into device state and reconcile canonical receipt identities. The cached Foods list uses that state so a new recipe remains visible after a lost server response and reload. Browser tests cover this path, mixed food/note/water copying, selection navigation, disabled actions, and local storage failure. R5 now has shared local preparation for capture/copy/clear/create, released and verified in 1.0.15. Installed-device verification remains open.

Version 1.0.16 supersedes the earlier background-queue Review flow. Queued writes reconcile and retry without global or per-change review prompts. Version 1.0.21 extends this to the library editors (R8); selection reads are addressed separately in 1.0.19 (R7). Tests cover retained transient failures, automatic reconciliation and lost acknowledgements. Widget sharing follows the [public sharing guide](https://support.cronometer.com/hc/en-us/articles/21818099650836-Mobile-Social-Sharing), with local image generation and a tested image-download fallback. Native device sharing is not yet verified for the new Diary flow.

Additional inspected states: Profile sex/weight/height/body-fat pickers; Diary Settings folds/subtotals/quick-add; Note editor/photo chooser; Cardio exercise picker/effort; Suggest Food filters/results/quantity/remove; Oracle form/results/back; Repeat create/options/pending list. These are structure checks unless separately stated above, not complete journey passes.

Further checks: Macro & Energy fixed/advanced controls, Macro Scheduler list/options, new template Fixed/Ratio/cancel, missing-profile expenditure setup/cancel, Nutrient Targets categories/vitamin rows. The populated expenditure state remains unverified because this synthetic account has no profile. The local fixture command adapter now supplies its catalog reader; the earlier Repeat sync failure was fixture-specific. Background error banners were absent after loading the corrected fixture and current bundle.

Version 1.0.14 local verification: all 638 tests passed, and the production Astro build passed. [CI and all Appwrite deployments passed](https://github.com/liangzixuan/nourishing/actions/runs/44838292756) at release commit `ddc9098`. Live version metadata, sync handling, Diary menus and sharing assets match the verified source. The public update cache includes the new version and sync modules. Installed-device verification of this release remains open. The earlier failed runs exposed stale UI assertions and an expected provenance hash update after extracting shared image actions; affected tests then passed. These results establish the tested behavior, not complete interface parity.


## November 20 follow-up comparisons

| Finding and references | Current local evidence | Open evidence |
| --- | --- | --- |
| D3/D16, 137–143 and 190–192 | Report and Targets share the six ordered nutrient groups. Source-specific rows remain available through additional nutrients or an explicit highlight. The fixtures cover selecting an advanced target, editing it, changing visibility, and opening its Report detail. | Exact platform styling and installed-device behavior. |
| D4, 134–136 | The Settings screen has Date Range, Days Displayed and Include Supplements. Pickers show the selected value. Tests cover staged custom dates, cancel, errors and applying a choice with Report folds retained. More options moved to the Report footer. | Native date picker and device keyboard. |
| D5, 102/325 | The Report Summary card shows an inline range and adjustment control. All six existing modes remain selectable. Screenshots cover unknown, measured, known zero and target rows. Reference 324 is scrolled below the card. | Switch order follows the existing selector. The captures do not show a switch interaction. |
| D7, 252–263 | Nutrition Facts has its own fold. The edit header opens a Delete sheet. Review has Back, Save Food and Save & Add to Diary. In the real Diary fixture a new food opened for logging before upload, appeared immediately, then synchronized as one food and one linked entry. | Exact serving and label layouts, built-in help content, native selectors and installed-device deletion. |
| D9, 160/166–167 | The expanded Diary Groups section has indexed inline fields and enable switches. The browser covers cancellation, occupied and unused slots, out-of-order activation, rename and queued updates. Existing entries and quick-add choices follow the renamed group. | Native keyboard and installed-device settings. |
| D10/D12, 204–214 | The filter overflow contains Reset Filters. Macro estimates show four full-width rows with values, targets and percentages. A removed ingredient can be restored to its original position or the Undo bar dismissed. Local screenshot checks found and corrected overlapping ingredient names and quantities. The results overflow still offers the existing result-specific actions. | Exact result-card layout, native touch and the quality of production suggestions. |
| D13, 242–251 | The main Oracle form now includes working Foods navigation. The full-screen category and results pages match the reference distinction. Chrome covered routing to Diary, search, ranking bases, quantity-aware results, category constraints and Back. | The fixture ranks a small synthetic catalog. Identical rankings to the reference and all production catalog sources remain unverified. |
| D14, 193–203 | Repeat search and serving counts are localized. Chrome exercised food detail → Next, empty weekdays, create, edit, enable/disable and delete. A repeat reappeared after restarting Chrome with API traffic blocked, and synchronized after reconnection. | The fixture shell remained available. Installed-device offline startup, keyboard and barcode remain open. |
| D15, 185–186 | The template editor places Units in the macro overflow. New templates also expose a draft-only restore action. Chrome exercised unit selection, cancellation and template create/update/delete with the scheduler. | Reference 186 shows the overflow buttons closed. Their exact menu contents remain unverified. |

## State coverage ledger

| Finding | Reference | Current evidence | Remaining checks |
| --- | --- | --- | --- |
| R10, saved meal expansion | 231, 235, 236 | The Chrome fixture reproduced a connection error after tapping Explode Meal with a cached account and an unavailable review endpoint. The shared expansion preview now reads the effective device state. In the fixture, an adjusted portion replaced its parent at the same position before upload. A second regression creates the meal and parent offline, reloads before upload, loses the expansion reply and verifies the canonical child and its lineage after retry. | Installed-phone restart, swipe and production account verification remain open. |
| D19, saved meal row options | 231 | The previous screenshot showed a full-screen list of gray buttons. The updated screenshot shows the nine actions in reference order in a bottom sheet above navigation, with leading icons. The browser checks outside dismissal, Escape, edit original, edit copy, Repeat, Settings, adjustment, nutrition and expansion. Synthetic screenshots are in `.local/meal-actions/`. | Exact typography and icon artwork, copy and delete from this menu, and device gestures remain open. |

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


### Selected nutrition reads (1.0.19, released)

The selection summary still required a server round trip and rejected a whole-workspace revision change. Thus an unrelated save could interrupt a read on one device. The stale-revision regression reproduced that failure; the browser regression also failed when the nutrition endpoint was unavailable.

Selected totals now use the effective device snapshot, including pending edits. The Diary carousel and item/group nutrition sheets share the same reader and canonical calculation. A read without a device snapshot uses the server without requiring an unchanged revision. Transient failures retry in the background; the view has no error, review, retry or reload prompt. Leaving the view cancels its reads, listeners and retry timer. Nutrition-sheet refreshes preserve expanded sections.

Focused tests pass for canonical targets and mixed record types, offline selection, rapid changes, an offline amount edit reflected before upload, automatic uncached recovery after a failed response, and cancellation on navigation. The main cached browser scenario makes zero nutrition-review requests. All 654 local tests and the production Astro build passed. [CI and all Appwrite deployments passed](https://github.com/liangzixuan/nourishing/actions/runs/44853927098): 651 passed, zero failed, three expected Linux skips. The site and all three functions reached ready. Live version, tracked selection modules, CSS and the unchanged local projection match the tested release; required offline assets are present. The generated diary bundle was not independently compared for this release. This fixes the selection-read path; it does not establish that every remaining editor uses local saves.


### Diary restoration and pending selection (1.0.20)

Two browser regressions exposed follow-up failures. After a completed save invalidated the response cache, resuming Diary offline showed Try again despite a retained device snapshot. The failure path now renders that account snapshot, including pending edits. This verifies offline resume; it does not claim a new online startup timing measurement.

An open nutrition sheet also retained a temporary entry ID after its save receipt replaced the record. It then displayed the whole day (464 kcal) instead of the selected entry (33 kcal). The local state owner now returns projected state and record aliases from one account revision. Selection reads resolve those aliases before calculating. The same regression passes with the real background worker and canonical command handler; the synthetic catalog reader was corrected before establishing the product failure.

All 654 local tests passed, including offline addition, resume, opening selected nutrition before upload and keeping its value after acknowledgement. The production Astro build passed. [CI and Appwrite deployment passed](https://github.com/liangzixuan/nourishing/actions/runs/44855661423). All eight checked live assets, including the generated Diary bundle, match the tested release, and the offline manifest contains them. Installed-phone verification was not performed in this pass.


### Local library editor saves (1.0.21, released)

Custom food, recipe and meal previews now use shared domain calculations on the device snapshot. Saves enter the account-owned IndexedDB queue and immediately update the library. Save & Add can open a new local item before upload. Receipts replace temporary identities in dependent recipes, meals and diary entries atomically. The server applies the explicit update-existing-uses or preserve-existing-uses choice against current data; unrelated writes no longer invalidate a graph review token. This intentional choice remains separate from sync status. Food notes omitted from device snapshots are retained on name/nutrient edits.

Focused browser checks pass for all three editors, recipe import, localized food labels, lost replies, offline creation, dependent edits, diary additions and restart. The queue regression verifies exactly one food, recipe, meal and diary entry, with correct final identities and nutrition. The shared browser test helper now polls completed IndexedDB reads instead of treating an unresolved promise as a successful wait. All 656 local tests and the production Astro build passed. [CI and all Appwrite deployments passed](https://github.com/liangzixuan/nourishing/actions/runs/44859150375) at release commit `a7e927b`: 653 tests passed, zero failed, and three expected Linux skips. The site, reminders, scheduler and account-cleanup deployments reached ready. All 15 checked live assets, including the generated Diary bundle, match the tested release. The offline asset list includes them and excludes the removed sync-notice module. Evidence is retained in `.local/release-1.0.21-live-proof.json`. No installed-phone check is claimed.


### Diary group selection and row gestures (1.0.22, released)

Group selection now has its own control and stays separate from folding. The selected group reaches food, photo, voice, barcode, note, exercise and biometric destinations through the common Add action. Row gestures reveal the existing options or delete actions; deletion retains confirmation and the durable local queue. Vertical scrolling, cancelled touches and multi-select do not trigger row actions. Keyboard-accessible menu buttons remain available.

Saved Android reference 20 establishes the trailing orange delete button, reference 21 establishes confirmation, and reference 230 establishes the leading teal options button. Browser screenshots of both revealed actions were inspected. The browser regression selects Breakfast, opens the note editor with that group, saves a note while uploads are held, deletes it through a swipe, then verifies the canonical queue leaves it deleted. Other checks cover options, delete dismissal, vertical scrolling, interrupted touch, completed-day controls and existing mixed-record group CRUD. The fixture now supplies the real offline-command handler needed by note creation. The Suggest Food retry fixture now starts the real background worker and verifies acknowledged, duplicate-free results instead of racing a transient queue status. All 656 tests passed with local test concurrency limited to four, and the production Astro build passed. Earlier runs exposed the duplicate menu selector, corrected here, and timing-sensitive browser fixtures. [CI and all four Appwrite deployments passed](https://github.com/liangzixuan/nourishing/actions/runs/44862310091): 653 tests passed, zero failed, three expected Linux skips. All ten checked live assets match release commit `6f6b1a8`, and required offline assets are present. Evidence: `.local/release-1.0.22-live-proof.json`. No installed-phone check is claimed.


### Pending record edits (1.0.23, released)

A pending note opened with a disabled editor. Manual-record edits required a snapshot review hash, so a second edit could fail after the first changed the record. The app now validates edits on its effective local state and places them in the durable queue. The serialized server transaction applies each edit to the latest record. The shared normalization preserves attachments, copy lineage and exercise calculation facts. Completed days and source-owned records retain their existing edit rules. The old editor conflict/reload lock and waiting-to-sync message are removed.

The expanded browser regression also exposed incomplete receipts: `record.correct` omitted its canonical updated row. Local-only pending metadata then remained in the device snapshot and caused a subsequent group-copy fingerprint mismatch. Receipts now include the updated row, replacing the projection before dependent commands run. The regression checks the group-copy operation after repeated biometric and exercise edits.

Photo-note saves use the same current-record rule. A browser test queues a new photo note and two edits offline, restarts, loses the first save reply, retries it unchanged, and verifies one final note with its attachment and correct canonical ID. The full Diary browser test adds a note, edits it twice with uploads held, reloads, syncs, then deletes it. Focused browser and command checks pass. The full local run passed 656 tests and exposed one stale assertion expecting a locked pending-note editor. After updating that expectation and queued command types, the offline restart/account-isolation test passed. The production Astro build passed. [CI and all Appwrite deployments passed](https://github.com/liangzixuan/nourishing/actions/runs/44863597322) at release commit `a8fe061`: 654 tests passed, zero failed and three expected Linux skips. The site and all three functions reached ready. The live site reports 1.0.23; all ten checked assets match the tested build, including the generated Diary bundle and local projection. Required offline assets are present. Evidence is retained in `.local/release-1.0.23-live-proof.json`. No installed-phone check is claimed.
