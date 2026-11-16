# Snapshot child screens

The Snapshot menu now uses the source app's Edit Date, Edit Caption and Delete choices. Date opens the source calendar; caption and delete use compact source dialogs. A snapshot opens the source full-screen viewer. Camera and Files use the source chooser. Camera capture uses `MobilePhotoCapture`, including track cleanup on cancellation, navigation and disposal.

Reference: `cronometer-local/public/mobile-snapshots.js` and saved images in `cronometer-local/verification/mobile-snapshots-20261109/candidate/verification/`. Source and output hashes are recorded in `snapshot-ui-source.json`. Local comparison captures are in `.local/snapshot-child-ui/`.

The calendar omits diary markers because the cloud snapshot response does not contain a diary marker capture. It does not show invented records. The option menu's navigation forwards to the current app navigation. The cloud commands retain the original image identity, creation time, timestamp, title, vitals and measurement attribution when only the caption or date changes.

Upload retries retain the same prepared body and request ID. Caption retries use the existing command receipt. A failed date operation has an explicit retry; opening another editor removes that old retry. Drafts are held only in the mounted view and are discarded on disposal.

Validation: `node --test tests/snapshot-child-ui.test.mjs tests/snapshots.test.mjs` passed six tests. Chrome checks upload, lost-response retries, metadata, calendar/caption cancellation, delete, viewer, outside dismissal, Escape, the native Back event, bottom navigation, fake-camera capture and track cleanup. Production CSP reports no violations. The browser fixture uses the actual normalization and snapshot domain functions; it does not establish hosted Appwrite behavior.

`node scripts/verify-snapshot-child-hosted.mjs` checks the deployed UI with a disposable account and synthetic photo. It records screenshots and results under `.local/snapshot-child-hosted/`, verifies the owner workspace head is unchanged, and cleans up owned rows, media and the test account. Run it only after deploying this increment. Physical-phone camera verification remains separate from Chromium's fake-camera test.
