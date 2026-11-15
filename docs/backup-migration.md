# Account backup migration

The cloud backup format contains the current workspace and every photo referenced by its records. It does not contain account credentials, Appwrite account IDs, storage permissions, session cookies, API keys, device registrations, operation receipts, catalog-wide food data, deleted photo blobs or earlier recovery generations. Foods already captured in the workspace remain in the backup. This is a current-workspace backup, not a copy of the whole Appwrite project or the old PC database.

## Source behavior

The original `cronometer-local/server/backup.mjs` owns SQLite backup validation and restoration. Its relevant contracts are:

- Validate records through `initialState`, `settings.save` and `mergeImport` before replacement.
- Require every referenced photo in its own namespace. Identical image hashes in two namespaces do not make the namespaces interchangeable.
- Validate normalized JPEG bytes through `validateStoredPhoto`.
- Keep a recovery snapshot before replacement.
- Pause scheduled fasting after import.

Internal recovery snapshots have no automatic age or count limit. The PC store appends them to its `backups` table; the latest-100 query limits the selection list, not retention. Cloud **Previous versions** follows that behavior. Retained generations and their referenced photos remain user data until account deletion or a future user-selected removal feature.

The separate daily archive files use a different policy: retain one verified archive for each of the newest 14 distinct backup days, rotating only after a new archive passes validation. That policy applies to the PC daily backups and T7 cloud-backup archives. It does not expire Previous versions or cloud photo assets.

The cloud module uses these source owners. It retains original record IDs and evidence. The source domain validates the incoming copy; its reconstructed rows are not substituted for the original records. Legacy normalization is rejected explicitly. The only planned restore change is pausing fasting schedules, which appears in the reviewed summary. The original backup remains unchanged.

## File format

The JSON file contains `format: "nourishing-workspace"`, `version: 1`, `createdAt`, `workspace`, `media` and `digest`. Each media entry contains `namespace`, `id`, `bytes`, `width`, `height` and its normalized JPEG `dataUrl`. The SHA-256 digest covers the canonical manifest with each `dataUrl` removed. Every image ID is the SHA-256 digest of its bytes. The digest detects corruption; it does not authenticate who made a backup.

Namespaces are `meal_photos`, `progress_photos` and `note_photos`. Extra, duplicated and missing images are rejected. Images have the original 3 MiB and 1600-pixel limits. Workspace JSON retains the source 20 MB limit. The complete inspection request, including the manifest, photo metadata and revision, must also fit the cloud's 20,000,000-byte request limit. Export checks this limit before offering a file. Photo bytes use separate requests and do not count toward the manifest limit. The browser rejects files above the original backup limit of 1 GiB before parsing; it still needs enough memory to assemble or read the selected file. No incomplete file is offered as a successful backup.

## Server adapter contract

All routes require the current session. Mutations also require the exact application Origin. The authenticated account supplies the owner ID; a request must never select an owner, generation, Appwrite file ID or storage URL.

1. `GET /api/backup/export`: read one verified workspace and the stored metadata for all references from `backupReferences(state)`. Call `backupManifest(state, descriptors)`. Return `{revision: digest(state), manifest}`. Fail if a referenced image is missing. Do not read arbitrary storage rows supplied by the client.
2. The browser obtains each image through the authenticated private-media route, checks its byte count and hash, then rechecks the export revision before downloading one JSON file. A changed workspace or failed image cancels the download.
3. `POST /api/backup/inspect`, body `{manifest, revision}`: call `inspectBackup(current, body, {ownerId})`. Store its `review` and validated manifest in private server storage. Return `{reviewToken: review.token, summary}`. The manifest has no inline image bytes. Expire abandoned reviews using the shared review policy. Do not restore anything here.
4. `POST /api/backup/media`, body `{reviewToken, namespace, photo: {id, dataUrl}}`: load this account's review and manifest. Validate with `validateBackupMedia(manifest, {namespace, photo})`. Stage the verified bytes in this account's private storage. Repeated identical uploads must succeed. Staging must not change the active workspace head. Bound each upload to the normalized JPEG transport size. Include `note_photos` in the shared storage namespace allowlist.
5. `POST /api/backup/restore`, body `{requestId, reviewToken, confirmation: "replace"}`: check a matching durable receipt first, then load the account-private review and its manifest. Call `prepareBackupRestore(current, manifest, body, {ownerId, review, readMedia})`. `readMedia(namespace,id)` must return exact `{id,dataUrl}` from that review's verified staged images. The function checks every image before returning a full replacement.
6. Persist replacement records and all required media metadata in a new account-owned generation. Verify its digest and completeness. In one transaction, guard the old head revision, switch the head to the new generation, and save the restore receipt. Return the same result for an exact request replay, including when its original HTTP response was lost. A reused request ID with changed content must fail.
7. Retain the previous generation for recovery. Do not delete old rows or private blobs during the commit. Failed staging must remain private and must not affect active records. Backup reviews expire after 30 minutes; this ends permission to use the review, not retention of a generation or its photos. Expired review metadata can be removed separately. A generation without a valid retained manifest is unverified or incomplete; that status alone does not authorize deletion.

The server must check the revision again at the transaction boundary. `prepareBackupRestore` does not make a database transaction and is not a substitute for the head guard. The request cannot import account authentication, profile-table settings or device write authority. Source Health Connect IDs retained in workspace records are evidence, not permission to write to a device.

## UI contract

`mountBackup({root, show, close, header, content, onChange})` returns `{dispose}`. The existing modal owns close and outside-dismiss behavior. Add the stylesheet `backup.css`.

The page offers **Download backup** and **Restore backup**. Choosing a file inspects it and shows current and incoming record counts, the backup time and date range, photo count and any schedule changes. Only **Replace workspace** starts staged image uploads and restoration. A failed commit can be retried with the same request ID. A revision conflict requires a new inspection. The browser stores no backup draft or credentials in local storage.

## Validation status

`tests/backup.test.mjs` covers full record and nutrition round-trip, each photo namespace, corrupt/missing/duplicate images, manifest tampering, cross-account review rejection, stale revisions, explicit confirmation, unsupported authority fields and visible fasting-schedule changes. Browser coverage uses synthetic data and an in-memory service fixture. `tests/backup-store.test.mjs` checks bounded create-only staging and retry behavior.

`scripts/verify-backup-cloud.mjs` uses disposable Appwrite accounts to check all photo namespaces, nutrition parity, review privacy, account isolation, atomic head replacement, durable receipt replay, stale reviews and retention of the old generation. It removes only its fixture accounts, rows and images. The Previous versions selector verifies retained manifests and photo references before allowing restore; its checks are in `scripts/verify-recovery-cloud.mjs` and `scripts/verify-recovery-hosted.mjs`. Automatic deletion of abandoned generations and unreferenced photo blobs is not implemented. Retained recovery versions do not automatically expire.
