# Local-to-cloud UI parity

Status: initial shell/Diary/Foods/More restoration is live. The Add menu and Discover body/header follow-up is live and passed hosted checks. Full parity of child editors is still incomplete. Functional verification alone does not establish visual parity.

## Approved restoration work

The user approved restoring the source interface. Keep the Appwrite service contracts and account isolation, and adapt the original view components to those contracts. No redesign or native Health Connect restoration is in scope.

- [x] Shared shell and Discover: restore source icon navigation, per-screen sticky headers, typography, Dashboard card layout and header actions. Root owns `diary.html`, `diary.js`, `diary.css`, shell assets and Discover composition.
- [x] Foods: restore original home cards and collection navigation while retaining cloud editors and imports. Foods worker owns library components and their focused checks.
- [x] More: restore searchable rows and child screens; use the cloud Account destination and keep removed native integrations absent. More worker owns its adapter and the target settings composition.
- [x] Diary: restore canonical summary panels, water and fasting with existing domain projections. Diary worker owns the summary adapter and projection; root wires actions.
- [x] Initial integration: test navigation, date changes, sheet dismissal, edits, dark/system theme and narrow-screen overflow. Compare screenshots against the source at the same viewport and state. Run affected local checks, build, deploy and repeat hosted checks with disposable accounts.

Preserve unrelated changes and owner data. Screens must not expose dead controls, default browser button rows or loading captures as completed output. Returning from a child screen must not focus search. Each worker reports changed files and executed checks; root owns integrated acceptance and deployment.

On November 15, 2026, both apps were captured in Chrome at a 412 × 915 viewport. The local reference was `http://127.0.0.1:4288/?mobile=1`; the deployed target was `https://nourishing.app/diary`. A disposable cloud account was removed after capture. Private screenshots and the capture record are in ignored `.local/ui-parity/`. Loading-state captures were rejected and replaced after each destination rendered.

| Step | Surface | Observed gap | Source to preserve |
| --- | --- | --- | --- |
| 1 | Diary | Extra brand/account header; text-only navigation; single summary presentation instead of the source summary navigation. Water and fasting sections are absent from this cloud view. | Local `mobile-diary` renderers, summary panels and `discover-ui.js` navigation. |
| 2 | Discover | Separate toolbar below the tabs, different title/card spacing, simplified Coach card and different typography. | Local `discover-ui.js`, `discover.css` and the original Dashboard renderer. |
| 3 | Foods | Tabs and a row of plain buttons replace the source card menu for custom meals, recipes, foods and tools. | Local Foods home and library screen components. |
| 4 | More | A combined Targets & Settings form replaces the searchable More menu and its child screens. | Local `mobile-more.js` and its styles; adapt Account to cloud authentication and omit removed Health Connect destinations. |

The producing boundary is the cloud frontend, not DNS or the PWA runtime. `public/diary.html` defines a separate shell, `public/library.js` constructs a different Foods home, and `public/nutrition.js` constructs the combined settings form. Reused domain calculations and some renderers do not preserve the complete UI contract.

Restore the source components and assets through adapters to the cloud APIs. Do not repair these differences with unrelated replacement styling. Preserve working account isolation, transactions, offline storage and public-origin validation. Verify each restored screen at the same viewport and state, then check its navigation and actions. Add parity checks to release verification before declaring the migration complete.

These screenshots establish visible layout differences. The local account and empty cloud fixture have different settings, so numeric values and conditional content need a same-state fixture before they can establish data-projection defects. Keyboard, screen-reader and full accessibility compliance were not audited. Password recovery and remaining phone camera/barcode, notifications and offline checks remain pending separately.

## Restoration validation

The shared shell now uses the source navigation SVGs, Karla/Lato fonts and Discover styles. Foods uses the source home and collection renderers; More uses the source row layout and child headers. Diary uses the source summary carousel and the existing domain nutrition projection. Strict CSP is retained: summary grid row counts use data attributes and stylesheet rules. Display settings remain reachable through Diary actions even when summary panels are hidden.

Local checks cover the complete Diary → Foods → More → Discover flow, settings persistence, system theme, Back without focusing search, report navigation, source chart rendering, strict CSP and phone-width overflow. Source assets have provenance manifests. Captures are in ignored `.local/ui-restored-*.png` and `.local/dashboard-mobile.png`. Source/local account settings differ; these screenshots validate structure and presentation, not equality of account data.

Remaining visual gaps: several child editors, including Targets, fasting details and account pages, still use cloud sheet adapters. The Diary Energy Summary/display dialogs preserve cloud actions rather than the original full page composition. Separate Notes/Biometrics sections remain in the cloud diary. These are not claimed as complete source parity.


## Add menu and Discover follow-up

The first release passed navigation checks but left the old Add to Diary menu and simplified Charts, Report and Snapshots bodies. The owner correctly identified these gaps. Source components now restore:

- Add to Diary: four colored tiles and five actions, editable colors/order/visibility, saved account preferences, outside dismissal and cancelled-edit rollback.
- Charts: title/chevron cards, source colors, external legends and dates, chart previews and Manage Charts switches. Newsfeed and Manage Charts are available in the header.
- Report: consumed/expenditure rings, energy budget, grouped nutrients and Date Range/Days Displayed/Include Supplements settings. Newsfeed and Report Settings are available in the header.
- Snapshots: horizontal empty state and source photo cards. Newsfeed remains available; the reference has no settings button on this tab.

The 434-test suite passed 433 cases initially; its Coach-to-Report test expected removed date inputs. That test now checks the actual report date request and passes. Integrated navigation, Dashboard/Add menu, barcode camera decoding, record editors and snapshot upload/retry/edit/delete browser checks passed. Build and diff checks passed. These checks use desktop Chrome at phone width, not the disconnected Pixel.

### Remaining gaps

- Search Food: source tabs, database filters, sorting, badges and multi-add.
- Food entry: favorite/options controls, timestamp toggle, source/nutrition sections and fixed footer.
- Photo Log review: per-food macros, energy summary and Create menu.
- Diary: mixed note/biometric placement within groups.
- Detailed chart settings/CGM comparison, snapshot editors, Targets, fasting and other child tool forms still use cloud adapters.
- Latest Cronometer Report Remaining ring and full nutrient-detail screen differ from the saved local implementation restored here.

Public password recovery is deferred by the owner. Installed-phone camera/barcode, notification delivery and offline operation still need device verification. Functional browser checks do not establish complete visual or device parity.


## Hosted acceptance

Deployment `6afa9a8c6e1c5f3b0cca`, revision `0e2a837a7bda90efe184c77e06d0e5af5d5a090d`, is active at https://nourishing.app. The production browser check passed at phone width with no browser, HTTP or CSP errors. It checked saved Add menu preferences, cancelled edits, outside dismissal, Search Food and New Fast destinations, Diary display/water, Foods/More navigation, system theme, Back focus and account access. Report and Charts header actions opened their actual settings and Newsfeed. Snapshots used the restored empty state and Add Snapshot action.

The temporary account and its records were removed. The owner's workspace head remained unchanged. Live Report, Charts, Snapshots and Add menu screenshots were captured; Report and Charts were visually inspected after deployment. Evidence: ignored `.local/ui-restoration-hosted/result.json` and PNG captures. Source asset hashes were verified against published LF-normalized bytes. This does not replace installed-Pixel verification or close the child-screen gaps above.
