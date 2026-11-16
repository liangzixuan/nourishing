# Local-to-cloud UI parity

Status: incomplete. The production PWA installs and the diary loads on the owner's Pixel, but the cloud frontend does not preserve the local app's interface. Functional verification does not establish visual parity.

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
