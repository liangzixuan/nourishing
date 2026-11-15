# Nourishing Android source

This package preserves the shipped 0.25.21 / code 46 Android app and Wear modules. It comes from `cronometer-local/verification/native-phone-reminder-client-20261111/candidate/android-health-connect`, the release identified by that project's `stage-status.json`. The older top-level companion folder is not the full app source.

This unpublished candidate defaults to `https://nourishing-cloud.appwrite.network`. Build with `-PworkspaceOrigin=https://nourishing.app` only after production cutover is verified. Personal PC hostnames were replaced with synthetic test names. No installed app has changed.

## Cloud account boundary

`CloudAccountSession.kt` supplies the configured cloud shell and its existing Health Connect panel:

- Only `https://nourishing.app` and `https://nourishing-cloud.appwrite.network`, on HTTPS port 443, are accepted.
- `CloudWebSession.kt` reads the existing first-party `__Host-nourishing_session` cookie from Android CookieManager. It does not copy a session into preferences or expose it through JavaScript.
- `connect()` obtains the immutable account ID from `GET /api/account`. Run all network calls off the UI thread.
- Each operation retains the returned account lease. Requests and responses reject a changed cookie, explicit invalidation, another session owner's lease or a superseded connection. An email address is never an ownership key.
- Mutations send the exact Origin header and a one-shot JSON body. Redirects and automatic retries are disabled. Response bodies are bounded to 1 MiB.
- `invalidate()` and the invalidation callback are the integration points for logout and expiry. `isCurrent()` must be checked before publishing a result to native UI or local caches.

`CloudHealthTransfer.kt` sends the staged export to `/api/health-connect/preview?summary=1`, then imports only after confirmation through `/api/health-connect/import?summary=1`. Confirmation sends the same reviewed bytes and review token. A changed file or account blocks the import. A missing commit response leaves the review available for an explicit idempotent retry. The panel checks the account signed into the same WebView; there is no second login screen.

Cloud hourly import requires a checked account, selected read permissions, Android background-read permission, and an explicit Enable hourly import action. `CloudHealthSyncWorker` uses the existing snapshot reader and preview/import contract. Consent stores the account ID, origin, selection and a session digest; it never stores the cookie. A changed selection or session requires renewed consent. Checks run before both uploads. A lost import response is not retried immediately; the next hourly snapshot uses stable source record IDs.

Cloud widgets use `GET /api/home-widgets?unit=kcal|kJ` and require the v3 account-bound response. The existing card, source-credit and calendar parser also validates cloud results. Widget configuration previews the signed-in account before saving. Separate cloud preferences prevent legacy PC widget data or consent from being reassigned. Changed sessions clear cached cloud displays; stale configuration results cannot replace newer settings.

Cloud builds keep native export, reconciliation, Wear relay and native reminders inactive. Startup cancels legacy work and clears displayed phone notifications. Stored native write journals, legacy consent settings and receipts remain under their original connection. Cloud session changes invalidate operation leases. An expired session never falls back to the PC or another account.

## Focused tests

Use an already installed JDK 17, Gradle 8.13 and Android SDK 36/build tools 35.0.0. `Build.ps1` accepts an existing tool root and does not install tools:

```powershell
./Build.ps1 -ToolRoot 'C:/path/to/existing/.local-tools' -CloudSessionOnly
```

The focused gate compiles the app and its test sources, then runs `CloudAccountSessionTest`, `CloudHealthTransferTest`, `CloudNativeBackgroundTest`, `CloudHomeWidgetTest` and the retained `HomeWidgetTest`. These check exact origins, cookie selection, stable account identity, reviewed import bytes, account changes, stale replies, authentication failures, background consent, widget envelopes and retry behavior using controlled transports and local TLS fixtures. They do not contact Appwrite, use owner health records, build an APK or prove device behavior. Real account login, scheduled Health Connect reads, logout and launcher widget checks remain required before shipping the cloud APK.

The existing native suite has two HTTP fixtures that depended on the PC server. Their cloud versions belong in `android/tests/intake-session-http-fixture.mjs` and `android/tests/android-reminder-client-http-fixture.mjs`. They have not yet been ported. Full-suite runs require these fixtures; they are not silently skipped. An explicit Gradle property `-PnativeServerFixtureRoot=<existing fixture directory>` can run the retained source tests against an existing fixture tree, but that does not validate the cloud backend. Do not copy the PC server into this repository to satisfy these tests.

Keep SDK/JDK/Gradle installations, build outputs, APKs, signing keys and Google services configuration out of Git. Preserve the existing package and signing identity when preparing an eventual in-place Android update.
