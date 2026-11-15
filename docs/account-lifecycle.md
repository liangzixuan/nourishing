# Account lifecycle and backups

Account deletion starts from Account → Delete account. The dialog offers a verified backup download and requires the current password. Preparing the receipt does not delete data. Confirmation creates a durable job and closes the account to new app work. A private HttpOnly receipt lets the same browser check progress after its sign-in session is revoked.

The server waits for active operations, then removes private photos, records from every generation, retained versions, staged reviews, command receipts and profile data. It checks the remaining rows and Storage files before removing the Auth account. An exact account ID and creation timestamp prevent a retry from deleting a replacement account that reused the ID. Completed status receipts retain no owner ID and expire after seven days. Counts are confirmed checkpoints, not exact totals after an interrupted batch.

An unresolved operation or an ownership mismatch leaves the job pending or needing attention. Time passing does not prove that a remote write stopped. An operator must inspect uncertain work before resolving it. Provider-managed logs or backups are outside this app's deletion workflow; downloaded copies remain on the user's devices.

## Deployment

1. Run `scripts/provision-account-lifecycle.ps1` with PowerShell 7.3 or later. It saves the prior schema and verifies three server-only tables.
2. Run `node scripts/migrate-account-access.mjs initialize` before deploying the request gate. Registration initializes later accounts explicitly. Private requests never create a missing lifecycle row.
3. Give the preview's dynamic API key `users.read` and `users.write`, in addition to its existing session, row and file scopes. Deploy the account code, then run `node scripts/migrate-account-access.mjs profiles` to remove direct client profile writes. The migration saves prior permissions and refuses unexpected ownership.
4. Build the private Function package with `node scripts/package-account-cleanup.mjs`. Use `server/account-cleanup-entry.mjs`, the pinned lockfile, and row/file/user read/write scopes. Keep execute permissions empty. `ACCOUNT_CLEANUP_ENABLED=true` enables its logic; its schedule is configured separately.

The worker processes bounded batches and retains interrupted jobs. Expiry cleanup applies only to abandoned preparations and completed status receipts. It never expires a pending deletion or unresolved operation.

The private cloud worker is enabled on a 60-minute interval, supported by the current free plan. Browser status requests can advance a confirmed job immediately; background completion proceeds in bounded batches if the browser closes. A large or stalled job can require multiple hourly runs. No public role can execute this Function. Its deployed entry passed both a targeted disposable-account deletion and an empty-queue invocation. The timer's first automatic run has not yet been observed. Appwrite interval settings are described in the [execution guide](https://appwrite.io/docs/products/functions/execute).

## T7 backup

`scripts/cloud-drive-backup.mjs` reads one configured account with a read-only Appwrite key. It verifies the workspace revision before and after reading, verifies every referenced photo, then writes a portable JSON backup to the approved volume. The script checks the drive label and serial number, reads back the complete archive and publishes it by renaming its staging directory. It retains 14 verified daily copies. Unknown or damaged archives and the old SQLite backup folder are left intact.

The ignored `.local/cloud-backup.json` contains the endpoint, project, confirmed owner, time zone and volume identity. The credential stays on NTFS as a current-user DPAPI value produced by `ConvertFrom-SecureString`. It is never stored on the T7 or passed as a command-line argument. Its Appwrite scopes are `rows.read` and `files.read`; Appwrite scopes apply project-wide, while the backup code restricts the export to the configured owner.

`scripts/run-cloud-backup.ps1` passes the decrypted key only to its hidden Node child and records a sanitized result beside the configuration. `scripts/install-cloud-backup-task.ps1`, run with Windows PowerShell 5.1, shows the task plan by default. With `-Install`, it registers a daily 09:00 local-time trigger and a logon trigger for the current Windows user. Missed starts run when available. The task requires that user to be signed in and the PC and approved drive to be available. The app's PC server is not required.

Backups preserve Health Connect lineage. Restore into an existing account requires matching lineage and invalidates old review tokens. The recovery verification uses an isolated empty workspace before a native export identity is assigned; it does not establish cross-account import support.

## Verification

- `npm test`: lifecycle, password, HTTP receipt, UI cancellation/recovery, file cleanup, backup integrity and Windows runner checks.
- `node scripts/verify-built-boundaries.mjs`: built SSR request limits and authentication checks.
- `node scripts/verify-account-deletion-hosted.mjs`: real hosted deletion and isolation using disposable accounts.
- `node scripts/verify-account-cleanup-cloud.mjs`: invoke only the exact disposable deletion job through the deployed private Function, without browser polling.
- `node scripts/verify-account-registration-hosted.mjs`: hosted registration, login, logout, profile changes and direct-client write denial, followed by fixture cleanup.
- `node scripts/verify-drive-backup-restore.mjs`: read the verified T7 copy, restore into a private fixture, compare records and photo bytes, then remove the fixture. The owner's workspace stays unchanged.

Fixture scripts keep ownership evidence in `.local`. They initialize lifecycle state explicitly and verify fixture identity before cleanup. Do not publish those ledgers, backups or credentials.

## Installed backup schedule — November 15, 2026

The durable read-only key is stored as a current-user DPAPI credential in the ignored local configuration directory. A fresh cloud export with all three photos was saved and verified on the approved T7. The daily 09:00 Central task and logon trigger are installed. A manual Task Scheduler run returned exit code 0 and verified the current archive without warnings. The next scheduled run is November 16 at 09:00 Central. The original plaintext file supplied in Downloads was left unchanged.
