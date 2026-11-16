# Device caching

Nourishing stores account-specific screen data and saved photos in IndexedDB. A verified sign-in selects the account before cached responses can be read. Opening a saved screen uses that local response immediately. Responses older than 30 seconds refresh in the background; main views apply the result when no editor is open. The first visit also warms the main Discover and Foods reads, with at most two background requests at a time.

More → Account uses the same account-scoped cache for name, email, verification status, time zone and units. The authentication request itself stays network-only; credentials and provider fields are excluded. Returning to More keeps the current shell and search state. Account edits invalidate the display cache.

Writes invalidate response caches before and after the request, including a lost reply. Server revisions and exact retry receipts still decide whether a write succeeds. Cache tickets include the account, session epoch and cache revision. A response from an older ticket cannot repopulate the cache or replace the screen after invalidation. A restored workspace generation also clears response caches.

The response/photo cache holds up to 128 entries and 20 MiB, evicting least recently used entries. Individual JSON responses are limited to 2 MiB and photos to 8 MiB. The separate full offline diary snapshot and queued edits are preserved outside that LRU. The app refreshes the full snapshot after loading and after writes. Logout clears private data, with the existing Sync/Discard/Cancel choice when offline edits remain. Session expiry locks the snapshot and clears responses. Account changes cannot expose another account's cached data.

Public UI scripts, styles, icons and fonts use a release-versioned service-worker cache. Only the offline shell is eagerly downloaded; other assets are cached when used. API responses, photos, credentials and authentication pages never enter the shared public cache. Passwords, session cookies, signed reviews and mutation receipts are not response-cache entries.

Discover supports single-finger left/right swipes between Dashboard, Charts, Report and Snapshots, without wrapping. Content follows the horizontal drag and slides into the adjacent tab when it is ready. A slow uncached response uses its normal loading view after a 400 ms transition bound. Reduced-motion preferences and unsupported browsers use direct navigation. Vertical scrolling, chart gestures, controls, horizontally scrolling areas and dialogs keep their own behavior.

Validation evidence is recorded in PROGRESS.md. Desktop browser checks do not establish physical-device notification delivery or camera behavior.
