# Web Push source reuse

Inspected on 2026-11-15. These are adaptations of the existing local Nourishing implementation, not whole-file copies.

The source root is `C:/Users/zixua/Documents/REA/cronometer-local`.

| Source | SHA-256 of inspected file |
| --- | --- |
| `server/reminders.mjs` | `03741a25812bda272716cc9d5557cd9fe22642ce7d0680c9ab9b8d4ce2a829c6` |
| `server/reminder-contract.mjs` | `26b7c294422836ab4db7e29b35cbaf0d7e2e54eb09a5eb08cdf332f71a3daa02` |
| `public/reminders.js` | `09a9b13cbfb7a3353ce45e25855e6b592b64b8fd955387fa366308f61158a3a6` |
| `public/reminder-worker.js` | `e6fbc6fd7a5dec85911e3c9d4de029dac093195bc2a51dfa35fd257ed22bc1a1` |

`server/web-push.mjs` adapts `parseReminderSubscription`, `bytes`, `keyPair`, and `createReminderPushTransport` from the local server. It preserves the standard push-provider allowlist, P-256 key checks, VAPID key-pair validation, encrypted Web Push request construction, redirect rejection, and response-body cleanup. It accepts the configured public HTTPS origin instead of requiring a Tailscale origin. Unknown subscription fields are rejected.

`server/web-push-store.mjs` retains the local limit of eight devices and one test per device per minute. It retains the five-minute push TTL, ten-second transport deadline, and accepted/rejected/expired/unknown outcomes. The Appwrite implementation adds owner-scoped private account rows, atomic test claims, and stable request receipts. A lost send or receipt acknowledgement does not cause an automatic resend. Stored `sending` is reported as unknown until a final outcome exists.

`public/reminders.js` adapts the local explicit permission prompt, subscription reuse, VAPID rotation, and disconnect sequence. It uses the existing cloud `/sw.js` registration. Connecting or testing does not enable scheduled delivery. Notification text remains generic and contains no diary or health details.

The SQLite service, its native Android/watch transports, its Tailscale routing rules, and its process timer were not copied. No source-domain module was changed or added for this slice. The transport dependency is the existing local version, `web-push@3.6.7`.

Schedule migration and scheduled notification delivery are separate work. Existing reminder schedules are in the local SQLite `reminder_schedules` table, outside workspace JSON. Their migration must retain preferences and start paused. Existing private signing keys and local-origin subscriptions must remain local.

Validation for this slice uses an in-memory Appwrite boundary, real Web Push encryption with a fake HTTP transport, and a browser with mocked Notification/PushManager APIs. These checks do not establish real device permission or visible notification delivery.

The language adaptation uses `server/reminder-payload.mjs` for scheduled and explicit test sends. Only the supported locale crosses the transport boundary alongside the version and opaque tag. The worker ignores arbitrary title, body and destination fields. The generic body supports en/fr/de/pt-BR; invalid or missing language falls back to en. Existing delivery receipts prevent replay after the account language changes.
