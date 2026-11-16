# Coach source and checks

The cloud Coach uses the existing PC app's deterministic recorded-data path. It does not call a model. Goals, diet choices, notes, preference revisions, nutrient coverage, carbohydrate policy, water intake, energy units and target calculations retain their source meanings. Saved Coach preferences do not change nutrient targets or the recorded-data calculation.

Source inspected on 2026-11-15:

| Source in `cronometer-local` | SHA-256 |
| --- | --- |
| `public/coach-review.js` | `8f501412d34dd41104ed700011adfdcbd2fd5d90bc488ff6ab0e72d372200b10` |
| `public/discover-ui.js` | `b893d61eb6198ded40d71e01f97740c3b04d020c07f06ef1ac910217ad870710` |
| `server/coach-preferences.mjs` | `17a6689a0f2de3f858e18305b2ab830c72f93c0eb41ead3cd351ed32edfc0d3a` |

`server/coach-view.mjs` extracts the body of `localCoachResult` from `coach-review.js`. Imports and message formatting use the cloud domain modules and installed i18next. This is a function extraction, not an exact whole-file copy. The choices come from `discover-ui.js`. The exact copied intent matcher, Coach messages and preference module have entries in the domain provenance manifest.

The UI selects one diary date, matching the source helper's single-day calculation. It keeps source observations and limits under Details & limits. It omits the source notice about range selection and Ask Codex because neither control is present. Model chat and AI meal/settings analysis are outside this port. Facts retain unknown and partial measurements; the screen does not diagnose or prescribe treatment.

Checks: `node --test tests/coach-view.test.mjs tests/coach-http.test.mjs tests/coach-browser.test.mjs tests/coach-nutrition-browser.test.mjs` passed all 8 tests. They cover source calculation semantics, preference conflicts, authenticated HTTP boundaries, compact mobile rendering, closing during a request, and actual Discover navigation to Coach, Report and the Suggest Food callback. Browser checks used local fixtures in headless Chrome at 412 × 915. They did not use a physical phone, mutate cloud records or call a model.
