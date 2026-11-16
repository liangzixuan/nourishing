# Offline diary parity

The cloud PWA keeps an account-partitioned IndexedDB copy only after **Keep diary on this device**. The service worker caches public code and styles. It does not cache API responses, authentication pages, health records or photos.

Source provenance is recorded in `offline-source-manifest.json` and `domain-source-manifest.json`. The browser reuses the PC quantity and correction projections, biometric library, biometric validation and nutrition calculations. The cloud adapter replaces the SQLite receipt transaction with the existing owner-scoped Appwrite workspace transaction.

## Implemented

- Cold direct entry registers the worker and saves its public dependency closure before storing a diary copy.
- Restarting offline retains the saved diary, foods, recipe and meal quantity facts, pending changes and source nutrition totals.
- Saved-food additions, notes, water, explicit exercise and biometric batches queue with immutable operation IDs. Food versions and record revisions remain unchanged on retry.
- Existing food quantities and diary details, notes, exercise and manual biometrics use source correction rules. Newly queued records cannot be edited until synced; this matches the PC source.
- Reconnection sends commands in order. Lost responses retry the same ID. Changed records, changed foods and older restore generations remain conflicts instead of overwriting current data.
- Existing receipts are marked as replayed. A replay removes the pending command without restoring a record that may since have been deleted. Sync refreshes the authoritative snapshot afterward.
- Authentication expiry locks retained data until the same account is verified. Account switches cannot select another account's copy. Logout checks pending changes across all account partitions and clears all copies after sync or explicit discard. Owner/epoch checks reject delayed writes after logout.
- Cross-tab logout, lock or account switch closes the offline editor and removes the previous account's visible records.

## Offline controls and nutrition

- Pending changes can be exported as the source `nourish-offline-pending` JSON format, retried after a conflict, or discarded individually. Retry preserves the complete saved command, including its ID and revisions. Commands from an earlier restore cannot be retried. Discard changes only this device's outbox.
- Exercise entry and correction accept kcal and kJ through the source decimal conversion. The saved value remains kcal. Changing the selector keeps the entered number, as in the PC form.
- The measurement picker creates new custom definitions through the source `biometric.log` command. The reviewed definition and readings sync together. Catalog measurements, paired blood pressure and retained custom metrics use the same source library.
- Nutrition details show source nutrient values, targets, measurement coverage and upper limits. Hidden nutrients, macro visibility, consumed/remaining mode and energy units follow the saved settings. Missing measurements remain unknown. Groups start collapsed to keep the diary compact.
- English, French, German and Brazilian Portuguese labels use the source language catalogs. Nutrient labels use source nutrient identity translations. The open copy uses its saved application language; the initial page has a language selector. User-entered record names are preserved.

The standalone layout remains smaller than the PC offline dashboard. The PC also has temporary food/group selection, score cards, completeness cards and nutrient-balance cards. Those dashboard panels are not part of this compact diary view. Server validation errors without a source localization key retain their supplied message.

Offline photo recognition, AI requests and remote food-catalog search remain online features. Cached records with imported provenance remain subject to the source editability rules.

## Verification

`node --test tests/offline*.test.mjs` covers source validation, atomic store rollback, receipt replay, account/generation rejection, record revisions, HTTP authentication, session clearing and real Chrome service-worker behavior. The Chrome test covers cold direct entry, offline navigation/restart, food and water additions, food correction, kJ exercise entry, weight and custom measurement logging, pending JSON export, unchanged-command conflict retry, discard, French rendering, reconnect after a lost response, expiry locking, account isolation and public-cache contents. Nutrition tests cover source visibility, unknown measurements, unit conversion, saved settings and all four supported label languages.

These checks ran against local fixtures and production modules. They do not establish a deployed Appwrite or physical-phone offline check.
