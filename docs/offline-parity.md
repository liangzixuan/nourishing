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

## Remaining PC UI differences

- The PC pending list supports JSON export and manual retry/discard for each row. This version has conflict discard and a Sync action that retries pending or uncertain commands. It does not yet have export or per-row retry controls.
- The PC exercise form supports kcal and kJ. This form currently accepts kcal.
- The source biometric contracts support new custom definitions. This form currently exposes catalog measurements and retained/custom metrics, but does not create a new custom definition.
- This compact offline view shows calories and three macro totals. The PC offline view also shows the full nutrient summary and translated labels.

Offline photo recognition, AI requests and remote food-catalog search remain online features. Cached records with imported provenance remain subject to the source editability rules.

## Verification

`node --test tests/offline*.test.mjs` passed 13 tests on 2026-11-15. Coverage includes source validation, atomic store rollback, receipt replay, account/generation rejection, record revisions, HTTP authentication, session clearing and real Chrome service-worker behavior. The Chrome test covers cold direct entry, offline navigation/restart, food and water additions, food correction, exercise and weight logging, reconnect after a lost response, expiry locking, account isolation and public-cache contents.

These checks ran against local fixtures and production modules. They do not establish a deployed Appwrite or physical-phone offline check.
