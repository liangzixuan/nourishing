import {ID, Permission, Role} from 'node-appwrite';
import {encodeCommandReceipt,decodeCommandReceipt} from './command-receipt-codec.mjs';
import {workspaceRows, stageWorkspaceRows, assertStagedRows, recoveryMarker} from './workspace-generations.mjs';
import {verifiedWorkspaceMedia, workspaceMediaRows, copyWorkspaceMediaRow} from './workspace-media.mjs';
import {backupReferences, backupManifest} from './backup.mjs';
import {previewHealthReconciliation, prepareHealthReconciliation} from './health-reconciliation.mjs';
import {tickCloudFasting} from './fasting.mjs';
import {stageFastingDispatch} from './scheduler-dispatch.mjs';
import {stageReminderDispatch} from './reminder-schedules-dispatch.mjs';
import {offlineSnapshot as projectOfflineSnapshot, parseOfflineCommand, assertOfflineIdentity, applyOfflineCommand} from './offline.mjs';
import {beginCloudLogging, finishCloudLogging, loggingCalendar} from './cloud-logging.mjs';
import {digest, packWorkspace, rowId, unpackWorkspace} from './data-codec.mjs';
import {initialState} from './domain/workspace.mjs';
import {initializeHealthExportState, installHealthExportMetadata} from './health-export-state.mjs';
import {applyWorkspaceCommand, parseCommand, readActionFoods, captureActionFoods} from './workspace-commands.mjs';

const databaseId = 'nourishing';
const CATALOG_CONTEXT_TYPES = new Set(['food.multi.add', 'food.copy', 'library.edit']);

const args = (tableId, id) => ({databaseId, tableId, rowId: id});
const permissions = owner => [Permission.read(Role.user(owner))];
const dataOf = ({$id, $permissions, ...data}) => data;

function conflict() {
  throw Object.assign(Error('This diary changed. Refresh it before saving.'), {
    code: 409,
    publicMessage: 'This diary changed. Refresh it before saving.',
  });
}

async function optional(db, table, id) {
  try {
    return await db.getRow(args(table, id));
  } catch (error) {
    if (error.code === 404) return null;
    throw error;
  }
}

function nextRecoverySnapshot(head, state) {
  let current = head.recoverySequence ?? 0;
  if (!Number.isSafeInteger(current) || current < 0) {
    throw Object.assign(Error('Recovery sequence is invalid.'), {code: 503});
  }
  for (const receipt of state.healthSync?.streams ?? []) {
    current = Math.max(current, receipt.recoverySnapshotId ?? 0);
  }
  if (!Number.isSafeInteger(current) || current >= Number.MAX_SAFE_INTEGER) {
    throw Object.assign(Error('Recovery sequence is exhausted.'), {code: 503});
  }
  return current + 1;
}

function resolveDispatchDate(context = {}) {
  if (context.asOf) return new Date(context.asOf);
  if (context.now instanceof Date) return context.now;
  return new Date(context.now ?? Date.now());
}

function formatCommandResult(revision, saved) {
  return {
    ok: true,
    revision,
    ...(saved?.records ? {records:saved.records} : {}),
    ...(saved?.counts ? {counts: saved.counts} : {}),
    ...(saved?.entryIds ? {entryIds: saved.entryIds} : {}),
    ...(saved?.photoId ? {photoId: saved.photoId} : {}),
    ...(saved?.id ? {item: {kind: saved.kind, id: saved.id}} : {}),
  };
}

export function createWorkspaceStore(db, owner) {
  async function readOwnedHead() {
    const head = await db.getRow(args('workspace_heads', owner));
    if (head.ownerId !== owner) conflict();
    return head;
  }

  async function unpackOrConflict(head, rows) {
    try {
      return unpackWorkspace(head, rows);
    } catch (error) {
      const latest = await db.getRow(args('workspace_heads', owner));
      if (latest.digest !== head.digest) conflict();
      throw error;
    }
  }

  async function readReceipt(receiptId, fingerprint) {
    const receipt = await optional(db, 'command_receipts', receiptId);
    if (!receipt) return null;
    if (receipt.ownerId !== owner || receipt.fingerprint !== fingerprint) conflict();
    return decodeCommandReceipt(receipt.result);
  }

  async function stageReceipt(receiptId, fingerprint, result, transactionId) {
    await db.createRow({
      ...args('command_receipts', receiptId),
      data: {ownerId: owner, fingerprint, result: encodeCommandReceipt(result)},
      permissions: permissions(owner),
      transactionId,
    });
  }

  /** Opens a short-lived transaction guarded by the shared workspace head row. */
  async function withHeadTransaction(head, work, {checkGeneration = false, onRollbackError} = {}) {
    const tx = await db.createTransaction({ttl: 60});
    try {
      // Stage this shared guard first. Any later concurrent commit changes it and conflicts.
      await db.updateRow({...args('workspace_heads', owner), data: {digest: head.digest}, transactionId: tx.$id});
      const guard = await db.getRow(args('workspace_heads', owner));
      const changed =
        guard.ownerId !== owner ||
        guard.digest !== head.digest ||
        guard.$updatedAt !== head.$updatedAt ||
        (checkGeneration && guard.generation !== head.generation);
      if (changed) conflict();
      const result = await work(tx.$id);
      await db.updateTransaction({transactionId: tx.$id, commit: true});
      return result;
    } catch (error) {
      await db.updateTransaction({transactionId: tx.$id, rollback: true}).catch(() => {});
      if (onRollbackError) {
        const recovered = await onRollbackError(error);
        if (recovered !== undefined) return recovered;
      }
      if (error.code === 409) conflict();
      throw error;
    }
  }

  async function create() {
    if (await optional(db, 'workspace_heads', owner)) return;
    const state = initialState();
    initializeHealthExportState(state);
    const packed = packWorkspace(state, owner, ID.unique());
    const tx = await db.createTransaction({ttl: 60});
    try {
      for (const row of packed.rows) {
        await db.createRow({
          ...args('workspace_records', row.$id),
          data: dataOf(row),
          permissions: row.$permissions,
          transactionId: tx.$id,
        });
      }
      await db.createRow({
        ...args('workspace_heads', owner),
        data: packed.head,
        permissions: permissions(owner),
        transactionId: tx.$id,
      });
      await db.updateTransaction({transactionId: tx.$id, commit: true});
    } catch (error) {
      await db.updateTransaction({transactionId: tx.$id, rollback: true}).catch(() => {});
      if (error.code === 409 && (await optional(db, 'workspace_heads', owner))) return;
      throw error;
    }
  }

  async function stageDispatch(state, generation, transactionId, context = {}) {
    const now = resolveDispatchDate(context);
    const [fasting] = await Promise.all([
      stageFastingDispatch({
        db,
        owner,
        state,
        generation,
        transactionId,
        now,
        timeZone: context.timeZone ?? 'UTC',
      }),
      stageReminderDispatch({db, owner, state, generation, transactionId, now}),
    ]);
    return fasting;
  }

  async function persistPacked(packed, state, before, head, transactionId, context = {}) {
    const old = new Map(before.map(row => [row.$id, row]));
    const writes = [];
    for (const row of packed.rows) {
      const prior = old.get(row.$id);
      old.delete(row.$id);
      if (prior && prior.digest === row.digest && prior.position === row.position && prior.day === row.day) continue;
      writes.push(
        db[prior ? 'updateRow' : 'createRow']({
          ...args('workspace_records', row.$id),
          data: dataOf(row),
          ...(prior ? {} : {permissions: row.$permissions}),
          transactionId,
        }),
      );
    }
    for (const id of old.keys()) {
      writes.push(db.deleteRow({...args('workspace_records', id), transactionId}));
    }
    writes.push(db.updateRow({...args('workspace_heads', owner), data: packed.head, transactionId}));
    writes.push(stageDispatch(state, head.generation, transactionId, context));
    await Promise.all(writes);
    return packed.head.digest;
  }

  async function persist(state, before, head, transactionId, context = {}) {
    const packed = packWorkspace(state, owner, head.generation);
    return persistPacked(packed, state, before, head, transactionId, context);
  }

  async function command(raw, readCatalog, context = {}) {
    const input = parseCommand(raw);
    const receiptId = rowId(owner, input.requestId);
    const fingerprint = digest(input);
    const [existing, head] = await Promise.all([
      readReceipt(receiptId, fingerprint),
      optional(db, 'workspace_heads', owner),
    ]);
    if (existing) return existing;
    if (!head || head.ownerId !== owner || head.digest !== input.revision) conflict();
    // Resolve catalog facts and current workspace rows in parallel before opening the write transaction.
    const [catalogFoods, before] = await Promise.all([
      readActionFoods(input, readCatalog),
      workspaceRows(db, owner, head.generation),
    ]);

    return withHeadTransaction(
      head,
      async transactionId => {
        const state = await unpackOrConflict(head, before);
        context.beforeApply?.();
        const loggingBefore = beginCloudLogging(state, input.type);
        const calendar = loggingBefore ? await loggingCalendar(db, owner, context) : null;
        const action = captureActionFoods(state, {type: input.type, payload: input.payload}, catalogFoods);
        const commandContext = CATALOG_CONTEXT_TYPES.has(input.type) ? {...context, owner, catalogFoods} : context;
        const saved = applyWorkspaceCommand(state, action, commandContext);
        finishCloudLogging(state, loggingBefore, input.type, calendar);
        const packed = packWorkspace(state, owner, head.generation);
        const result = formatCommandResult(packed.head.digest, saved);
        await Promise.all([
          persistPacked(packed, state, before, head, transactionId, context),
          context.stageMedia ? context.stageMedia({transactionId, generation: head.generation}) : null,
          stageReceipt(receiptId, fingerprint, result, transactionId),
        ]);
        return result;
      },
      {
        onRollbackError: async () => {
          const saved = await optional(db, 'command_receipts', receiptId);
          if (saved && saved.ownerId === owner && saved.fingerprint === fingerprint) return decodeCommandReceipt(saved.result);
        },
      },
    );
  }

  async function offlineSnapshot() {
    const head = await readOwnedHead();
    const rows = await workspaceRows(db, owner, head.generation);
    const latest = await db.getRow(args('workspace_heads', owner));
    const changed =
      latest.ownerId !== owner ||
      latest.generation !== head.generation ||
      latest.digest !== head.digest ||
      latest.$updatedAt !== head.$updatedAt;
    if (changed) conflict();
    return projectOfflineSnapshot(unpackWorkspace(head, rows), {ownerId: owner, generation: head.generation});
  }

  async function offlineCommand(raw, context = {}) {
    const input = parseOfflineCommand(raw);
    const head = await readOwnedHead();
    assertOfflineIdentity(input, {ownerId: owner, generation: head.generation});
    const receiptId = rowId(owner, input.operationId);
    const fingerprint = digest(input);
    const existing = await readReceipt(receiptId, fingerprint);
    if (existing) return {...existing, replayed: true};

    return withHeadTransaction(
      head,
      async transactionId => {
        const before = await workspaceRows(db, owner, head.generation);
        const state = unpackWorkspace(head, before);
        const loggingBefore = beginCloudLogging(state, input.type);
        const calendar = loggingBefore ? await loggingCalendar(db, owner, context) : null;
        const result = applyOfflineCommand(state, input, {ownerId: owner, generation: head.generation});
        finishCloudLogging(state, loggingBefore, input.type, calendar);
        result.revision = await persist(state, before, head, transactionId, context);
        await stageReceipt(receiptId, fingerprint, result, transactionId);
        return result;
      },
      {
        checkGeneration: true,
        onRollbackError: async error => {
          const latest = await db.getRow(args('workspace_heads', owner));
          assertOfflineIdentity(input, {ownerId: owner, generation: latest.generation});
          const saved = await optional(db, 'command_receipts', receiptId);
          if (saved && saved.ownerId === owner && saved.fingerprint === fingerprint) {
            return {...decodeCommandReceipt(saved.result), replayed: true};
          }
          throw error;
        },
      },
    );
  }

  async function tickFasting(context) {
    const head = await readOwnedHead();
    const before = await workspaceRows(db, owner, head.generation);
    const state = await unpackOrConflict(head, before);
    tickCloudFasting(state, context);
    if (digest(state) === head.digest) return {changed: false};

    return withHeadTransaction(head, async transactionId => {
      const revision = await persist(state, before, head, transactionId, context);
      return {changed: true, revision};
    });
  }

  /** Stage existing schedules for activation without changing health records. */
  async function syncFastingDispatch(context = {}) {
    const head = await readOwnedHead();
    const state = unpackWorkspace(head, await workspaceRows(db, owner, head.generation));
    return withHeadTransaction(
      head,
      async transactionId => {
        const plan = await stageDispatch(state, head.generation, transactionId, context);
        return {scheduled: Boolean(plan)};
      },
      {checkGeneration: true},
    );
  }

  /** Operator-only migration. Existing heads never acquire a generated namespace on read. */
  async function importHealthExportMetadata(metadata, {revision} = {}) {
    if (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision)) conflict();
    const head = await readOwnedHead();
    const before = await workspaceRows(db, owner, head.generation);
    const state = unpackWorkspace(head, before);
    const result = installHealthExportMetadata(state, metadata);
    if (!result.changed) return {changed: false, revision: head.digest};
    if (head.digest !== revision) conflict();

    return withHeadTransaction(head, async transactionId => {
      const next = await persist(state, before, head, transactionId);
      return {changed: true, revision: next};
    });
  }

  async function stageRecoveryGeneration({head, before, state, prepared, batchDigest, snapshotId, storage}) {
    // The recovery marker is a promise that this exact old generation can be restored.
    // Verify every referenced photo and record permission before staging that promise.
    const expectedPerm = JSON.stringify(permissions(owner));
    if (before.some(row => JSON.stringify(row.$permissions) !== expectedPerm)) {
      throw Object.assign(Error('Recovery record ownership is invalid.'), {code: 409});
    }
    const media = await verifiedWorkspaceMedia({db, storage, owner, generation: head.generation, references: backupReferences(state)});
    const retainedAt = new Date().toISOString();
    backupManifest(state, media.descriptors, {asOf: retainedAt});
    const retained = recoveryMarker(head, retainedAt, {snapshotId});
    const generation = rowId(owner, 'health-reconciliation', head.generation, head.digest, batchDigest, snapshotId);
    const packed = packWorkspace(prepared.state, owner, generation);
    await stageWorkspaceRows(db, packed.rows);
    const staged = await workspaceRows(db, owner, generation);
    assertStagedRows(packed.rows, staged);
    unpackWorkspace(packed.head, staged);
    const copied = media.rows.map(row => copyWorkspaceMediaRow(row, {owner, generation}));
    await stageWorkspaceRows(db, copied, {tableId: 'workspace_media'});
    assertStagedRows(copied, await workspaceMediaRows(db, owner, generation));
    return {packed, retained};
  }

  async function reconcileHealth(input, {reviewSecret, storage} = {}) {
    const head = await readOwnedHead();
    const before = await workspaceRows(db, owner, head.generation);
    const state = unpackWorkspace(head, before);
    const context = {ownerId: owner, reviewSecret};
    const preview = previewHealthReconciliation(state, input?.batch, context);
    const removes = !preview.replayed && preview.counts.deleted + preview.counts.replaced + preview.counts.invalidated > 0;
    const snapshotId = removes ? nextRecoverySnapshot(head, state) : undefined;
    const prepared = prepareHealthReconciliation(state, input, {...context, snapshotId});
    if (prepared.result.replayed) return prepared.result;

    const staged = prepared.needsSnapshot
      ? await stageRecoveryGeneration({head, before, state, prepared, batchDigest: preview.batchDigest, snapshotId, storage})
      : null;

    return withHeadTransaction(
      head,
      async transactionId => {
        if (staged) {
          const {$id, $permissions, ...data} = staged.retained;
          await db.createRow({...args('workspace_recoveries', $id), data, permissions: $permissions, transactionId});
          await db.updateRow({
            ...args('workspace_heads', owner),
            data: {...staged.packed.head, recoverySequence: snapshotId},
            transactionId,
          });
          await stageDispatch(prepared.state, staged.packed.head.generation, transactionId);
        } else {
          await persist(prepared.state, before, head, transactionId);
        }
        return prepared.result;
      },
      {
        checkGeneration: true,
        onRollbackError: async () => {
          // The source receipt is committed inside healthSync with the same head. It is
          // the sole authority for exact lost-response replay, including removal IDs.
          try {
            const latest = await db.getRow(args('workspace_heads', owner));
            if (latest.ownerId === owner) {
              const current = unpackWorkspace(latest, await workspaceRows(db, owner, latest.generation));
              const replay = prepareHealthReconciliation(current, input, context);
              if (replay.result.replayed) return replay.result;
            }
          } catch {}
        },
      },
    );
  }

  return {
    create,
    command,
    offlineSnapshot,
    offlineCommand,
    tickFasting,
    syncFastingDispatch,
    importHealthExportMetadata,
    reconcileHealth,
  };
}
