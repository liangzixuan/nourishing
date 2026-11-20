# Offline diary parity

Nourishing uses the same diary UI online and offline. An account-scoped IndexedDB snapshot holds saved diary data and the pending command outbox. The service worker stores public UI assets only. Private responses and photos remain in account-partitioned device storage.

## Local editing and sync

Food, water, notes, manual exercise and biometric edits use the normal diary editors. Supported calculations reuse the server's quantity, nutrition, adjustment and profile projections. Display preferences, chart preferences, profile edits, repeat items and snapshot metadata also update locally and sync in the background. New image uploads, AI recognition and uncached catalog searches require a connection.

The app persists a command before closing its editor. Storage failure keeps the form open. Reloading retains pending commands and their local effects. Reconnection verifies the account and workspace generation before replaying commands in order. Stable operation IDs and server receipts prevent duplicate saves after a lost response. Acknowledgements reconcile saved records and temporary IDs with queue removal in one transaction.

Food edits can follow a pending addition; their references are translated when the addition is acknowledged. Reviewed note, exercise and biometric corrections retain their record revisions. A pending correction in those editors must sync before another correction can be made. Completed days and imported-record edit rules still apply.

A workspace restore holds commands from the earlier generation for review. Retry cannot bypass that check. Session expiry locks retained data, account switches cannot expose another account's copy, and logout requires sync or explicit discard when pending changes remain. Delayed responses cannot write into a later account session.

## Recovery controls

More → Device storage shows pending changes from the shared outbox. It supports retry, individual discard, pending JSON export, snapshot refresh and removal of the device copy. A failed-save notice links to these controls. Discard removes the local pending command; it does not undo a command already accepted by the server. An uncertain save should be retried first so its receipt can be reconciled.

## Verification

Browser checks exercise real IndexedDB, the service worker, normal diary editors and production command contracts. Coverage includes offline restart, add/edit/delete, rapid dependent edits, lost responses, storage failure, malformed snapshots, restored generations, session locking and account isolation. Focused UI tests cover cached editors and delayed network responses. Shared projection tests compare local nutrition and settings against canonical server results.

Source provenance remains recorded in `offline-source-manifest.json` and `domain-source-manifest.json`. Physical-device camera, AI recognition quality and notification delivery require separate live checks; browser fixtures do not establish those results.
