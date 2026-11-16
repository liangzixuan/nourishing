# Library sharing and food printing

The cloud library uses the current PC application's nutrition-only JSON sharing contract. Foods, recipes, and meals export with their complete food and nested recipe dependencies. Personal food notes, retirement status, source photo evidence, and source text review metadata are omitted. This flow downloads a file; it does not publish a public link or send data to another account.

Import first previews the item name and dependency counts. The source graph validator checks dependencies, cycles, quantities, and immutable catalog facts. Colliding mutable IDs receive new IDs without replacing existing library items. Saving uses the cloud workspace revision and durable command receipt, so retrying an interrupted response does not import a second copy. The import screen owns the exact pending receipt and locks file selection while a save outcome is unknown. A stale preview requires Reload latest. Once a save is confirmed, a failed refresh retries only the refresh. The authenticated import and preview routes retain the source server's 20,000,000-byte request limit.

Saved foods have Print / Save PDF with the source nutrient categories, unknown values, quantities, attribution, language, and kcal/kJ display. Personal notes require the Include notes checkbox. Changing that checkbox replaces the capture; printing checks the current account against the capture owner. The generated document runs without scripts and uses a local stylesheet under the production content security policy.

The PC source has no recipe-specific print view. Recipes and meals can be shared as JSON; this change does not add a new print layout for them. Printing and sharing require an online account. Native system print-dialog interaction was not automated; the browser check verifies the generated document and dispatch to the frame's print function.

Source provenance is recorded in `domain-source-manifest.json` for the backend and `library-print-source-manifest.json` for the browser renderer. `scripts/copy-library-print-ui.mjs` reproduces the browser copy and its four localized stylesheets. It reuses the already copied report dependencies after checking their hashes. Its only renderer adaptation replaces the source inline CSS with a local stylesheet for the cloud content security policy.

Focused checks cover dependency round trips, private evidence omission, conflicting catalog facts, atomic rejection, command receipts, authenticated HTTP routing and body limits, and the real Chrome library flow with the production HTTP handler and content security policy.

The hosted check in `scripts/verify-library-sharing-hosted.mjs` uses a disposable account and the production Foods menu. It checks cancellation, lost-response receipt replay, stale preview reload, original graph preservation, and owner isolation. It is prepared for the next candidate; it has not yet run.
