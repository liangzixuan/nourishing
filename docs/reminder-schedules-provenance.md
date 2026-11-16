# Scheduled Web Push adaptation

Inspected and adapted on 2026-11-15. All new notification delivery remains behind explicit user resume and a separate worker enable flag.

| Inspected source | SHA-256 |
| --- | --- |
| `cronometer-local/server/reminders.mjs` | `03741a25812bda272716cc9d5557cd9fe22642ce7d0680c9ab9b8d4ce2a829c6` |
| `cronometer-local/server/weight-reminder.mjs` | `38867509f0f3b8434b8242f85e583414344059e1c6132ca65375e55a9e0d2ea1` |
| `nourishing-cloud/server/scheduler-dispatch.mjs` | `3377b5a1d4d906b19f40e88f922f2b6d86b0c9a241f10c2679b2fd75d01879da` |
| `nourishing-cloud/server/cloud-scheduler.mjs` | `c5104ca87ce4fa520f0dc5816796cf2772bab56c529578401d57a09c25eb2738` |

`reminder-schedules.mjs` reuses the local schedule parser and due-event functions. `reminder-schedules-weight.mjs` retains the local weight rules with changed import paths. Reminder kinds remain daily, weight, fasting goal, and scheduled fast start. Daily food conditions, exact weight metric matching, seven-day weight intervals, and the 15-minute late boundary retain the source behavior. New queue planning uses the existing Temporal dependency and verifies local wall time across daylight-saving changes. Delivery still rechecks the source-derived due-event function.

The dispatch and repair modules adapt the cloud fasting scheduler's private delayed-execution protocol. Each intent binds the workspace generation, reminder preferences, device identities, and due time. Workspace or reminder-setting changes stage the intent in their own transaction. An expired intent cannot deliver for a new generation. Hourly repair repairs dispatch; it does not substitute for each due-time execution.

The store reserves a private delivery row before transport. Its identity includes owner, schedule, device, and occurrence. A stored claim prevents another send, including after an unknown commit or send result. Source limits remain 24 schedules, eight devices, and up to 32 candidate deliveries per execution. The existing 45-second worker budget reserves one ten-second send deadline before starting another request. Remaining candidates receive another delayed wake.

Workers enter the account lifecycle before reading the workspace or reserving delivery. Pending account deletion blocks entry. Logs contain aggregate counts only. Payloads contain only version and opaque tag, with fixed notification text supplied by the service worker.

The focused tests use synthetic records and an in-memory Appwrite boundary. They cover late and daylight-saving behavior, food and weight conditions, canonical scheduled-fast creation, pause/resume, uncertain outcomes, backlog continuation, stale wakeups, and account deletion. They do not establish actual provider execution timing or visible device notification delivery.

## Root integration contract

- Add private `reminder_dispatch` with the same columns and repair index as `fasting_dispatch`, and include it in account deletion.
- Add `push_deliveries` index `owner_created` on `ownerId, createdAt` for recent outcome history.
- Construct `createReminderScheduleStore({db,ownerId,origin,vapid})` with the authenticated owner and elevated account-operation client.
- Merge its `status()` after Web Push `status()` in `GET /api/reminders`.
- Map `POST /api/reminders/schedule` to `save({revision,schedule})`, `/schedule/delete` to `remove({revision,id})`, and `/settings` to `settings({revision,paused})`. Apply existing session, Origin, JSON, and body-limit rules.
- Within workspace transactions and generation swaps, call `stageReminderDispatch({db,owner,state,generation,transactionId,now})`. The fast-start transaction must also stage this intent.
- After successful commits, call `createReminderDispatcher(...).dispatch(owner)`. Failure to enqueue must leave the durable intent for repair.
- Package entrypoint `server/reminder-schedules-entry.mjs` as private function `nourishing-reminders`; scopes are `rows.read`, `rows.write`, `executions.read`, `executions.write`. Use the existing server secrets and `PUBLIC_ORIGIN`. `REMINDERS_ENABLED` defaults off. Its interval is hourly repair; individual deliveries use delayed executions.
- Import only schedule JSON from the approved local baseline. Preserve IDs and preferences, set `paused:true` and `resumedAt:null`, and retain the existing cloud device registrations. Local private keys and subscriptions must not be copied.

Historical receipt pruning was added after the first worker validation below. The retention section describes its local verification and remaining deployment work.

## Private worker package and cloud check

`node scripts/package-reminders.mjs` creates an immutable source snapshot under `.local/deploy-reminders-*` and writes metadata to `.local/reminders-stage.json`. It copies the existing server and lockfile. The package does not contain local configuration or credentials. Upload this directory using the existing Appwrite function deployment flow. The entrypoint is `server/reminder-schedules-entry.mjs`, runtime `node-22`, build command `npm ci --omit=dev`, and timeout 60 seconds. Start with `execute:[]`, `events:[]`, `enabled:false`, and `interval:0`. Required dynamic-key scopes are `rows.read`, `rows.write`, `executions.read`, and `executions.write`.

Set function variables `PUBLIC_ORIGIN`, `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` (secret), and `REMINDERS_ENABLED`. Reuse the site's existing VAPID pair; do not generate another pair. For the isolated check, enable the function and set `REMINDERS_ENABLED=true`, keeping interval zero and execute permissions empty. Wait for the intended deployment to become active.

`scripts/configure-reminder-worker.mjs` applies this metadata and uploads the staged package. It accepts the existing pair only through the child environment variable `NOURISHING_REMINDERS_VAPID_JSON`, validates it, and removes the variable before packaging. Its output and deployment record contain no signing key. Set `NOURISHING_REMINDERS_ORIGIN` to the site's current origin; domain cutover requires updating and redeploying the worker too.

Set `NOURISHING_EXPECTED_REMINDERS_DEPLOYMENT` to that deployment ID and `NOURISHING_REMINDERS_ORIGIN` to its exact `PUBLIC_ORIGIN`. Then run `node scripts/verify-reminders-cloud.mjs` with the existing temporary fixture operator credentials. The operator needs account fixture, row, function-read, and execution-read/write access. The script checks deployment identity and variables before creating its disposable account. It stores a synthetic browser subscription whose expiration is already in the past, queues a real delayed execution, and checks its private expired receipt, removed device, cleared intent, and stale replay. This proves the real worker path without sending a push notification. It does not verify visible notification delivery.

The verifier records the fixture identity and cleanup status in `.local/reminders-cloud-fixture.json`, and its results in `.local/reminders-cloud-verification.json`. Cleanup first blocks new account operations and waits for an existing operation to finish. If that wait or cleanup fails, it retains the account and reports the remaining resources. Individual sleep calls are at most five seconds. A normal delayed check takes approximately three to four minutes.

Appwrite's scheduled asynchronous execution response has no retained response body. The verifier checks its completion status, HTTP status, and persisted receipt/device/intent effects. The synchronous stale-callback check also checks its returned body.

After the isolated check and source schedule migration pass, hourly repair can be enabled with interval 60. The PWA still requires explicit user resume; migration preserves paused state.

## Cloud validation on 2026-11-15

The isolated check passed against reminder deployment `6afa3e3dddf46933b225`. Appwrite scheduled execution `6afa3f99abbce0821590` for 23:30:00 UTC, created its running execution at 23:30:00.914, and completed at 23:30:12.145 (11.23 seconds). The fixture produced one private expired receipt with provider status zero, removed its synthetic subscription and dispatch intent, and rejected a duplicate callback as stale. Fixture cleanup completed. This validates one real delayed execution without notification transport; it does not establish visible device delivery or a timing guarantee.

The fasting worker was then replaced by deployment `6afa40f5cd8663f8ffd2`, with `REMINDERS_ENABLED=true` captured before build. A private callback for a confirmed nonexistent account returned enabled and stale. Both workers were read back as enabled, with interval 60, no public execute permissions, no event triggers, and only row/execution read/write scopes. No real-owner dispatch bootstrap was performed during these checks. The reminder worker's origin remains `https://nourishing-cloud.appwrite.network`; domain takeover requires a matching origin update.


## Receipt retention

`server/reminder-receipt-retention.mjs` adapts the PC service's `HISTORY_MS = 90 days` and `MAX_DELIVERIES = 20000`. Source `cronometer-local/server/reminders.mjs` SHA-256 on 2026-11-15: `03741a25812bda272716cc9d5557cd9fe22642ce7d0680c9ab9b8d4ce2a829c6`.

Each owner retains receipts for at most 90 days and at most 20,000 records. At capacity, the oldest receipt is removed in the same guarded transaction that reserves a new send. This includes old uncertain outcomes, as in the source. Recent sending/unknown claims keep their identity and prevent repeated sends. The cloud presents an unfinished sending claim as unknown; it does not retry it.

Tick, reconcile and explicit tests prune old records in bounded pages. The exported `pruneReminderReceipts({db, owner, now: Date, limit: 100})` returns `{removed, more}`. The private account cleanup worker also selects the oldest expired receipts, deduplicates their owners, and runs pruning under the existing owner lifecycle operation. It respects the cleanup limit and time budget. This covers paused accounts without a dispatch intent; the next hourly run selects any remaining expired rows. Targeted account deletion requests do not run this global scan. The entrypoint uses AccountOperationClient so an uncertain mutation retains its lifecycle operation. A pre-existing oversized history must be reduced before a new claim can commit. The global scan needs a `created` key index on `push_deliveries.createdAt`; the existing owner/createdAt index remains. No new public permission is needed.

The combined retention, scheduled-reminder, Web Push and account-cleanup suite passed 36 tests. Coverage includes the exact 90-day boundary, private owner checks, bounded pages, transactional rollback, capacity during both test and scheduled sends, uncertain replay, paused accounts, deletion lifecycle exclusion, and the shared wall-time budget. This retention change has not been deployed or checked against live Appwrite by this agent.
