import {Readable} from 'node:stream';
import {parseAccountEdit} from './account-edit.mjs';
import {BARCODE_BODY_BYTES} from './barcode.mjs';
import {CSV_BODY_BYTES} from './csv-import.mjs';
import {deletionCookie, readDeletionTicket} from './deletion-cookie.mjs';
import {readCloudFoodSearchQuery} from './food-search.mjs';
import {captureServerError} from './sentry.mjs';
import {readSession, sessionCookie, clearSession, sessionContext} from './session-cookie.mjs';

const SPA_PATHS = new Set(['/', '/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/account']);
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT']);
const STATUS_CODES = new Set([400, 401, 403, 404, 405, 409, 413, 415, 429, 499, 502, 503, 504, 507]);
const DEFAULT_BODY_BYTES = 16384;
const MB = 1024 * 1024;
let clientErrorWindow = 0;
let clientErrorCount = 0;

function allowClientErrorReport() {
  const minute = Math.floor(Date.now() / 60_000);
  if (minute !== clientErrorWindow) {
    clientErrorWindow = minute;
    clientErrorCount = 0;
  }
  return ++clientErrorCount <= 10;
}

const CSP_HEADER =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const DEFAULT_MESSAGES = {
  400: 'Check your details or request a new link.',
  401: 'Please sign in. Check your email and password.',
  403: 'This action is not available.',
  404: 'Not found.',
  409: 'Your data changed. Please try again.',
  429: 'Too many attempts. Try again later.',
  503: 'Unable to connect. Please try again.',
};

const DEFAULT_CODES = {
  400: 'request.invalid',
  401: 'auth.required',
  403: 'request.forbidden',
  404: 'request.notFound',
  409: 'request.conflict',
  413: 'request.tooLarge',
  415: 'request.unsupportedMedia',
  429: 'request.rateLimited',
};

function fail(code, message, errorCode) {
  throw Object.assign(Error(message), {code, publicMessage: message, ...(errorCode ? {errorCode} : {})});
}

function fields(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !names.includes(k))) {
    fail(400, 'Check the form and try again.');
  }
  return value;
}

function string(value, min, max) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    fail(400, 'Check the form and try again.');
  }
  return value;
}

function credentials(body, register) {
  fields(body, register ? ['email', 'password', 'name'] : ['email', 'password']);
  const email = string(body.email, 3, 320).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email.', 'auth.invalidEmail');
  return {
    email,
    password: string(body.password, 8, 256),
    ...(register ? {name: string(body.name, 1, 128).trim()} : {}),
  };
}

function requireParams(searchParams, allowed, required = allowed, errorMessage = 'Invalid query.') {
  const keys = [...searchParams.keys()];
  if (
    keys.some(k => !allowed.includes(k) || searchParams.getAll(k).length !== 1) ||
    required.some(k => !searchParams.has(k))
  ) {
    fail(400, errorMessage);
  }
  return Object.fromEntries(searchParams);
}

async function readBody(req, limit = DEFAULT_BODY_BYTES) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req.body ?? []) {
    size += chunk.length;
    if (size > limit) fail(413, 'Request too large.');
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    fail(400, 'Invalid request.');
  }
}

function registerAccountRoutes(add) {
  add('GET', '/api/account', {
    auth: 'secret',
    handler: async ({api, secret, json}) => json(200, {...(await api.current(secret)), sessionContext: sessionContext(secret)}),
  });
  add('POST', '/api/account/update', {
    auth: 'secret',
    noSearch: 'Invalid account request.',
    handler: async ({api, secret, body, json}) => json(200, await api.updateAccount(secret, parseAccountEdit(body))),
  });
  add('PUT', '/api/profile', {
    auth: 'none',
    handler: async ({api, secret, body, json}) => {
      fields(body, ['timeZone', 'units']);
      string(body.timeZone, 1, 100);
      try {
        new Intl.DateTimeFormat('en', {timeZone: body.timeZone});
      } catch {
        fail(400, 'Choose a valid time zone.', 'profile.invalidTimeZone');
      }
      if (!['metric', 'imperial'].includes(body.units)) fail(400, 'Choose valid units.', 'profile.invalidUnits');
      if (!secret) fail(401, 'Please sign in.');
      return json(200, await api.updateProfile(secret, {timeZone: body.timeZone, units: body.units}));
    },
  });
  add('POST', '/api/auth/register', {
    auth: 'none',
    handler: async ({api, body, headers, json}) => {
      const session = await api.register(credentials(body, true));
      headers.set('Set-Cookie', sessionCookie(session));
      return json(200, {ok: true});
    },
  });
  add('POST', '/api/auth/login', {
    auth: 'none',
    handler: async ({api, body, headers, json}) => {
      const session = await api.login(credentials(body, false));
      headers.set('Set-Cookie', sessionCookie(session));
      return json(200, {ok: true});
    },
  });
  add('POST', '/api/auth/logout', {
    auth: 'none',
    handler: async ({api, secret, body, headers, json}) => {
      fields(body, []);
      try {
        await api.logout(secret);
      } catch (error) {
        if (error.code !== 401) throw error;
      } finally {
        headers.set('Set-Cookie', clearSession());
      }
      return json(200, {ok: true});
    },
  });
  add('POST', '/api/auth/recovery', {
    auth: 'none',
    handler: async ({api, body, json}) => {
      fields(body, ['email']);
      await api.requestRecovery({email: string(body.email, 3, 320).trim()});
      return json(200, {ok: true});
    },
  });
  add('POST', '/api/auth/reset', {
    auth: 'none',
    handler: async ({api, body, headers, json}) => {
      fields(body, ['userId', 'secret', 'password']);
      await api.resetPassword({
        userId: string(body.userId, 1, 36),
        secret: string(body.secret, 1, 4096),
        password: string(body.password, 8, 256),
      });
      headers.set('Set-Cookie', clearSession());
      return json(200, {ok: true});
    },
  });
  add('POST', '/api/auth/verification', {
    auth: 'none',
    handler: async ({api, secret, body, json}) => {
      fields(body, []);
      if (!secret) fail(401, 'Please sign in.');
      await api.requestVerification(secret);
      return json(200, {ok: true});
    },
  });
  add('POST', '/api/auth/verify', {
    auth: 'none',
    handler: async ({api, body, json}) => {
      fields(body, ['userId', 'secret']);
      await api.verifyEmail({userId: string(body.userId, 1, 36), secret: string(body.secret, 1, 4096)});
      return json(200, {ok: true});
    },
  });
  add('POST', '/api/client-error', {
    auth: 'secret',
    noSearch: 'Invalid error report.',
    maxBytes: 8192,
    handler: async ({body, json}) => {
      fields(body, ['name', 'message', 'stack', 'source']);
      const err = Object.assign(Error(string(body.message, 1, 500)), {
        name: string(body.name, 1, 100),
        stack: string(body.stack, 0, 4000),
      });
      const source = string(body.source, 1, 200);
      if (allowClientErrorReport()) {
        void captureServerError(err, {service: 'client', path: source.startsWith('/') ? source : '/', status: 500});
      }
      return json(200, {ok: true});
    },
  });
}

function registerDeletionRoutes(add) {
  add('POST', '/api/account/deletion/prepare', {
    auth: 'prebody',
    noSearch: 'Invalid account request.',
    handler: async ({api, secret, body, headers, json}) => {
      fields(body, ['password']);
      const prepared = await api.prepareAccountDeletion(secret, {password: string(body.password, 8, 256)});
      headers.set('Set-Cookie', deletionCookie(prepared.ticket));
      return json(200, prepared.status);
    },
  });
  add('POST', '/api/account/deletion/confirm', {
    auth: 'prebody',
    noSearch: 'Invalid account request.',
    handler: async ({api, secret, req, body, headers, json}) => {
      const ticket = readDeletionTicket(req.headers.get('cookie') ?? '');
      if (!ticket) fail(404, 'Deletion receipt not found.');
      fields(body, ['confirmation']);
      if (body.confirmation !== 'delete') fail(400, 'Confirm account deletion.');
      const result = await api.confirmAccountDeletion(secret, ticket);
      headers.set('Set-Cookie', clearSession());
      return json(result.status === 'deleted' ? 200 : 202, result);
    },
  });
  add('POST', '/api/account/deletion/status', {
    auth: 'none',
    noSearch: 'Invalid account request.',
    handler: async ({api, req, body, json}) => {
      const ticket = readDeletionTicket(req.headers.get('cookie') ?? '');
      if (!ticket) fail(404, 'Deletion receipt not found.');
      fields(body, []);
      return json(200, await api.accountDeletionStatus(ticket));
    },
  });
}

function registerOfflineAndReminderRoutes(add) {
  add('GET', '/api/offline', {
    auth: 'secret',
    noSearch: 'Invalid offline request.',
    handler: async ({api, secret, json}) => json(200, await api.offlineSnapshot(secret)),
  });
  add('POST', '/api/offline/commands', {
    auth: 'prebody',
    noSearch: 'Invalid offline request.',
    maxBytes: 601_000,
    handler: async ({api, secret, body, json}) => json(200, await api.offlineCommand(secret, body)),
  });
  add('GET', '/api/reminders', {
    auth: 'secret',
    noSearch: 'Invalid notification request.',
    handler: async ({api, secret, json}) => json(200, await api.reminders(secret)),
  });
  for (const [path, method] of [
    ['/api/reminders/subscribe', 'subscribePush'],
    ['/api/reminders/unsubscribe', 'unsubscribePush'],
    ['/api/reminders/test', 'testPush'],
    ['/api/reminders/schedule', 'saveReminder'],
    ['/api/reminders/schedule/delete', 'deleteReminder'],
    ['/api/reminders/settings', 'reminderSettings'],
  ]) {
    add('POST', path, {
      auth: 'prebody',
      noSearch: 'Invalid notification request.',
      handler: async ({api, secret, body, json}) => json(200, await api[method](secret, body)),
    });
  }
}

function registerHealthAndSharingRoutes(add) {
  add('GET', '/api/glucose-timeline', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) => {
      const input = requireParams(url.searchParams, ['from', 'to', 'compare'], ['from', 'to'], 'Choose a date range.');
      if (Object.hasOwn(input, 'compare')) {
        try {
          input.compare = JSON.parse(input.compare);
        } catch {
          fail(400, 'Choose a comparison.');
        }
      }
      return json(200, await api.glucoseTimeline(secret, input));
    },
  });
  add('GET', '/api/cycle', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) => {
      const input = requireParams(url.searchParams, ['from', 'to'], ['from', 'to'], 'Choose a date range.');
      return json(200, await api.cycleView(secret, input));
    },
  });
  for (const [path, kind] of [
    ['/api/cycle/preview', 'preview'],
    ['/api/cycle/removal-preview', 'removal-preview'],
    ['/api/cycle/import', 'import'],
    ['/api/cycle/remove', 'remove'],
  ]) {
    add('POST', path, {
      auth: 'prebody',
      noSearch: 'Invalid cycle request.',
      maxBytes: 20_000_000,
      handler: async ({api, secret, body, json}) => {
        if (kind === 'preview') return json(200, await api.cycleImportPreview(secret, body));
        if (kind === 'removal-preview') return json(200, await api.cycleRemovalPreview(secret, body));
        if (body?.type !== (kind === 'import' ? 'cycle.import' : 'cycle.remove')) fail(400, 'Choose a cycle action.');
        return json(200, await api.workspaceCommand(secret, body));
      },
    });
  }
  add('GET', '/api/library/share', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) =>
      json(200, await api.libraryShare(secret, requireParams(url.searchParams, ['kind', 'id'], ['kind', 'id'], 'Choose a library item.'))),
  });
  add('POST', '/api/library/share/preview', {
    auth: 'prebody',
    noSearch: 'Invalid library request.',
    maxBytes: 20_000_000,
    handler: async ({api, secret, body, json}) => json(200, await api.librarySharePreview(secret, body)),
  });
  add('POST', '/api/library/share/import', {
    auth: 'prebody',
    noSearch: 'Invalid library request.',
    maxBytes: 20_000_000,
    handler: async ({api, secret, body, json}) => {
      if (body?.type !== 'share.import') fail(400, 'Choose a shared library item.');
      return json(200, await api.workspaceCommand(secret, body));
    },
  });
  add('POST', '/api/library/food-print', {
    auth: 'prebody',
    noSearch: 'Invalid library request.',
    maxBytes: 20_000_000,
    handler: async ({api, secret, body, json}) => {
      fields(body, ['id', 'includeNotes']);
      return json(200, await api.libraryFoodPrint(secret, body));
    },
  });
  add('GET', '/api/coach/preferences', {
    auth: 'secret',
    noSearch: 'Invalid query.',
    handler: async ({api, secret, json}) => json(200, await api.coachPreferences(secret)),
  });
  add('POST', '/api/coach/answer', {
    auth: 'prebody',
    noSearch: 'Invalid Coach request.',
    handler: async ({api, secret, body, json}) => {
      fields(body, ['date', 'question', 'preferencesRevision']);
      return json(200, await api.coachAnswer(secret, body));
    },
  });
}

function registerImportAndPhotoRoutes(add) {
  add('POST', '/api/text-log/parse', {
    auth: 'prebody',
    noSearch: 'Invalid text log request.',
    maxBytes: 60_100,
    handler: async ({api, secret, body, json}) => json(200, await api.parseTextLog(secret, body)),
  });
  add('POST', '/api/imports/csv/preview', {
    auth: 'prebody',
    noSearch: 'Invalid CSV request.',
    maxBytes: CSV_BODY_BYTES,
    handler: async ({api, secret, body, json}) => json(200, await api.previewCsvImport(secret, body)),
  });
  add('POST', '/api/imports/csv/import', {
    auth: 'prebody',
    noSearch: 'Invalid CSV request.',
    maxBytes: CSV_BODY_BYTES,
    handler: async ({api, secret, body, json}) => json(200, await api.importCsv(secret, body)),
  });
  for (const [path, method, maxBytes] of [
    ['/api/photos/analyze', 'analyzePhoto', 12 * MB],
    ['/api/photos/save', 'savePhoto', 5 * MB],
    ['/api/snapshots/prepare', 'prepareSnapshot', 12 * MB],
    ['/api/snapshots/save', 'saveSnapshot', 5 * MB],
    ['/api/note-photos/prepare', 'prepareNotePhoto', 12 * MB],
    ['/api/note-photos/save', 'saveNotePhoto', 5 * MB],
  ]) {
    add('POST', path, {
      auth: 'prebody',
      noSearch: 'Invalid photo request.',
      maxBytes,
      handler: async ({api, secret, body, req, json}) => json(200, await api[method](secret, body, req.signal)),
    });
  }
  add('GET', '/api/snapshots', {
    auth: 'secret',
    noSearch: 'Invalid query.',
    handler: async ({api, secret, json}) => json(200, await api.snapshots(secret)),
  });
  for (const [path, method] of [
    ['/api/recipe-import', 'importRecipe'],
    ['/api/recipe-import/preview', 'previewRecipeImport'],
    ['/api/recipe-import/draft', 'recipeImportDraft'],
  ]) {
    add('POST', path, {
      auth: 'prebody',
      noSearch: 'Invalid recipe request.',
      maxBytes: 16 * MB,
      handler: async ({api, secret, body, json}) => json(200, await api[method](secret, body)),
    });
  }
  for (const [path, method] of [
    ['/api/barcode/lookup', 'barcodeLookup'],
    ['/api/barcode/preview', 'barcodePreview'],
    ['/api/barcode/save', 'barcodeSave'],
    ['/api/branded/search', 'brandedSearch'],
  ]) {
    add('POST', path, {
      auth: 'prebody',
      noSearch: 'Invalid barcode request.',
      maxBytes: BARCODE_BODY_BYTES,
      handler: async ({api, secret, body, json}) => json(200, await api[method](secret, body)),
    });
  }
}

function registerBackupAndLibraryRoutes(add) {
  for (const [path, method, maxBytes] of [
    ['/api/backup/inspect', 'inspectBackup', 20_000_000],
    ['/api/backup/media', 'uploadBackupMedia', 5 * MB],
    ['/api/backup/restore', 'restoreBackup', DEFAULT_BODY_BYTES],
    ['/api/backup/recovery/inspect', 'inspectRecovery', DEFAULT_BODY_BYTES],
  ]) {
    add('POST', path, {
      auth: 'prebody',
      noSearch: 'Invalid backup request.',
      maxBytes,
      handler: async ({api, secret, body, json}) => json(200, await api[method](secret, body)),
    });
  }
  add('GET', '/api/backup/recoveries', {
    auth: 'secret',
    noSearch: 'Invalid recovery query.',
    handler: async ({api, secret, json}) => json(200, await api.listRecoveries(secret)),
  });
  add('GET', '/api/backup/export', {
    auth: 'secret',
    noSearch: 'Invalid backup query.',
    handler: async ({api, secret, json}) => json(200, await api.exportBackup(secret)),
  });
  add('POST', '/api/library/command', {
    auth: 'prebody',
    noSearch: 'Invalid editor request.',
    maxBytes: 4 * MB,
    handler: async ({api, secret, body, json}) => {
      if (!['library.retirement', 'food.save', 'recipe.save', 'meal.save', 'library.edit'].includes(body?.type)) {
        fail(400, 'Choose a library action.');
      }
      return json(200, await api.workspaceCommand(secret, body));
    },
  });
  add('POST', '/api/library/preview', {
    auth: 'prebody',
    noSearch: 'Invalid editor request.',
    maxBytes: 4 * MB,
    handler: async ({api, secret, body, json}) => json(200, await api.previewLibrary(secret, body)),
  });
  add('POST', '/api/library/edit-preview', {
    auth: 'prebody',
    noSearch: 'Invalid editor request.',
    maxBytes: 4 * MB,
    handler: async ({api, secret, body, json}) => json(200, await api.previewLibraryEdit(secret, body)),
  });
  add('GET', '/api/library', {
    auth: 'secret',
    noSearch: 'Invalid query.',
    handler: async ({api, secret, json}) => json(200, await api.library(secret)),
  });
  add('GET', '/api/library/favorites', {
    auth: 'secret',
    noSearch: 'Invalid library request.',
    handler: async ({api, secret, json}) => json(200, await api.favorites(secret)),
  });
  add('GET', '/api/library/tools', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) =>
      json(200, await api.libraryTools(secret, requireParams(url.searchParams, ['kind', 'id'], ['kind', 'id'], 'Choose a library item.'))),
  });
  add('GET', '/api/library/item', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) => {
      requireParams(url.searchParams, ['kind', 'id', 'entryId'], [], 'Invalid query.');
      const kind = url.searchParams.get('kind');
      if (!['food', 'recipe', 'meal'].includes(kind)) fail(400, 'Choose a library item.');
      return json(
        200,
        await api.libraryItem(
          secret,
          kind,
          string(url.searchParams.get('id'), 1, 1000),
          url.searchParams.has('entryId') ? string(url.searchParams.get('entryId'), 1, 1000) : null,
        ),
      );
    },
  });
  add('GET', '/api/library/food-copy', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) => {
      const params = requireParams(url.searchParams, ['kind', 'id'], ['kind', 'id'], 'Choose one food.');
      return json(200, await api.foodCopy(secret, {kind: params.kind, id: params.id}));
    },
  });
}

function registerDiaryAndReportRoutes(add) {
  add('GET', '/api/diary/ingredients', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) =>
      json(200, await api.entryAdjustment(secret, requireParams(url.searchParams, ['kind', 'date', 'id'], ['kind', 'date', 'id'], 'Choose a diary item.'))),
  });
  add('POST', '/api/diary/ingredients/preview', {
    auth: 'prebody',
    noSearch: 'Invalid editor request.',
    maxBytes: 4 * MB,
    handler: async ({api, secret, body, json}) => json(200, await api.previewEntryAdjustment(secret, body)),
  });
  add('POST', '/api/diary/ingredients/save', {
    auth: 'prebody',
    noSearch: 'Invalid editor request.',
    maxBytes: 4 * MB,
    handler: async ({api, secret, body, json}) => {
      if (body?.type !== 'entry.ingredients.adjust') fail(400, 'Choose an ingredient action.');
      return json(200, await api.workspaceCommand(secret, body));
    },
  });
  add('POST', '/api/diary/tools/review', {
    auth: 'prebody',
    noSearch: 'Invalid diary query.',
    maxBytes: 4 * MB,
    handler: async ({api, secret, body, json}) => json(200, await api.diaryToolsReview(secret, body)),
  });
  add('POST', '/api/diary/tools/save', {
    auth: 'prebody',
    noSearch: 'Invalid diary query.',
    maxBytes: 4 * MB,
    handler: async ({api, secret, body, json}) => {
      const allowed = [
        'records.copy',
        'records.clear-amounts',
        'records.move-group',
        'records.set-time',
        'records.delete',
        'selection.meal',
        'selection.recipe',
        'diary.order',
        'diary.sort-all',
        'group.order',
      ];
      if (!allowed.includes(body?.type)) fail(400, 'Choose a diary action.');
      return json(200, await api.workspaceCommand(secret, body));
    },
  });
  add('POST', '/api/nutrient-detail', {
    auth: 'prebody',
    noSearch: 'Invalid diary query.',
    maxBytes: 4 * MB,
    handler: async ({api, secret, body, json}) => json(200, await api.nutrientDetail(secret, body)),
  });
  add('POST', '/api/nutrition-report/nutrient', {
    auth: 'prebody',
    noSearch: 'Invalid diary query.',
    handler: async ({api, secret, body, json}) => json(200, await api.reportNutrientDetail(secret, body)),
  });
  add('POST', '/api/diary/preview', {
    auth: 'secret',
    handler: async ({api, secret, body, json}) => json(200, await api.previewDiary(secret, body)),
  });
  add('GET', '/api/diary/calendar', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) => {
      const {month} = requireParams(url.searchParams, ['month'], ['month'], 'Choose a calendar month.');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail(400, 'Choose a calendar month.');
      return json(200, await api.diaryCalendar(secret, {month}));
    },
  });
  add('GET', '/api/print-report/options', {
    auth: 'secret',
    noSearch: 'Invalid report query.',
    handler: async ({api, secret, json}) => json(200, await api.printReportOptions(secret)),
  });
  add('POST', '/api/print-report/preview', {
    auth: 'prebody',
    noSearch: 'Invalid report query.',
    maxBytes: 4 * MB,
    handler: async ({api, secret, body, json}) => json(200, await api.previewPrintReport(secret, body)),
  });
  add('POST', '/api/reports/export', {
    auth: 'secret',
    handler: async ({api, secret, body, json}) => json(200, await api.exportReport(secret, body)),
  });
  add('GET', '/api/fasting', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) => {
      const params = requireParams(url.searchParams, ['offset', 'limit', 'revision'], [], 'Invalid fasting query.');
      for (const key of ['offset', 'limit']) {
        if (params[key] !== undefined) {
          if (!/^(?:0|[1-9]\d*)$/.test(params[key])) fail(400, 'Invalid history page.');
          params[key] = Number(params[key]);
        }
      }
      return json(200, await api.fasting(secret, params));
    },
  });
  add('GET', '/api/food-insights/options', {
    auth: 'secret',
    noSearch: 'Invalid food insight query.',
    handler: async ({api, secret, json}) => json(200, await api.foodInsightOptions(secret)),
  });
  for (const [path, method] of [
    ['/api/food-insights/resolve', 'resolveFoodInsightIngredient'],
    ['/api/food-insights/oracle', 'foodOracle'],
    ['/api/food-insights/suggestions', 'foodSuggestions'],
    ['/api/food-insights/preview', 'previewFoodSuggestion'],
    ['/api/food-insights/ingredient-preview', 'previewFoodInsightIngredient'],
  ]) {
    add('POST', path, {
      auth: 'secret',
      noSearch: 'Invalid food insight query.',
      handler: async ({api, secret, body, json}) => json(200, await api[method](secret, body)),
    });
  }
}

function registerRecordsAndCatalogRoutes(add) {
  add('GET', '/api/pause-life', {
    auth: 'secret',
    noSearch: 'Invalid query.',
    handler: async ({api, secret, json}) => json(200, await api.pauseLife(secret)),
  });
  add('GET', '/api/display', {
    auth: 'secret',
    noSearch: 'Invalid query.',
    handler: async ({api, secret, json}) => json(200, await api.display(secret)),
  });
  add('GET', '/api/charts', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) =>
      json(200, await api.charts(secret, requireParams(url.searchParams, ['to', 'card'], ['to'], 'Choose chart dates.'))),
  });
  for (const [path, method] of [
    ['/api/dashboard', 'dashboard'],
    ['/api/profile-settings', 'profileSettings'],
    ['/api/nutrient-targets', 'nutrientTargets'],
    ['/api/targets', 'targets'],
    ['/api/target-policies', 'targetPolicies'],
  ]) {
    add('GET', path, {
      auth: 'secret',
      handler: async ({api, secret, url, json}) => json(200, await api[method](secret, requireParams(url.searchParams, ['date']).date)),
    });
  }
  add('GET', '/api/nutrition-report', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) => {
      const input = requireParams(url.searchParams, ['from', 'to', 'dayFilter', 'includeToday', 'includeSupplements']);
      for (const key of ['includeToday', 'includeSupplements']) {
        if (!['true', 'false'].includes(input[key])) fail(400, 'Invalid report filter.');
        input[key] = input[key] === 'true';
      }
      return json(200, await api.nutritionReport(secret, input));
    },
  });
  add('GET', '/api/repeats', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) => json(200, await api.repeats(secret, requireParams(url.searchParams, ['date']).date)),
  });
  add('GET', '/api/records/options', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) => json(200, await api.recordOptions(secret, requireParams(url.searchParams, ['date']).date)),
  });
  add('GET', '/api/records/exercise-catalog', {
    auth: 'secret',
    noSearch: 'Invalid query.',
    handler: async ({api, secret, json}) => json(200, await api.exerciseCatalog(secret)),
  });
  add('GET', '/api/records/item', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) =>
      json(200, await api.recordItem(secret, requireParams(url.searchParams, ['collection', 'id']))),
  });
  add('GET', '/api/records/exercises', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) => {
      const params = requireParams(url.searchParams, ['q', 'offset'], []);
      if (params.offset !== undefined && !/^(?:0|[1-9]\d*)$/.test(params.offset)) fail(400, 'Invalid exercise search.');
      const offset = Number(params.offset ?? 0);
      if (!Number.isSafeInteger(offset) || offset < 0 || (params.q?.length ?? 0) > 200) fail(400, 'Invalid exercise search.');
      return json(200, await api.exercises(secret, {q: params.q ?? '', offset}));
    },
  });
  add('GET', '/api/records/exercise-estimate', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) => {
      const params = requireParams(url.searchParams, ['date', 'code', 'minutes']);
      if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(params.minutes)) fail(400, 'Enter exercise minutes.');
      return json(200, await api.exerciseEstimate(secret, {...params, minutes: Number(params.minutes)}));
    },
  });
  add('POST', '/api/workspace/command', {
    auth: 'secret',
    handler: async ({api, secret, body, json}) => json(200, await api.workspaceCommand(secret, body)),
  });
  add('POST', '/api/target-policies/template-preview', {
    auth: 'secret',
    noSearch: 'Invalid query.',
    handler: async ({api, secret, body, json}) => json(200, await api.targetTemplatePreview(secret, body)),
  });
  add('POST', '/api/target-policies/preview', {
    auth: 'secret',
    noSearch: 'Invalid query.',
    handler: async ({api, secret, body, json}) => json(200, await api.previewTargetPolicy(secret, body)),
  });
  add('GET', '/api/food-search', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) => {
      let input;
      try {
        input = readCloudFoodSearchQuery(url.searchParams);
      } catch (error) {
        if (error.status === 400) fail(400, error.message);
        throw error;
      }
      return json(200, await api.foodSearch(secret, input));
    },
  });
  add('POST', '/api/food-search/preview', {
    auth: 'secret',
    noSearch: 'Invalid preview.',
    handler: async ({api, secret, body, json}) => json(200, await api.previewFoodMultiAdd(secret, body)),
  });
  add('GET', '/api/diary', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) => {
      requireParams(url.searchParams, ['date'], []);
      const date = url.searchParams.get('date');
      const parsed = new Date(`${date}T12:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
        fail(400, 'Choose a valid date.');
      }
      return json(200, await api.readDiary(secret, date));
    },
  });
  add('GET', '/api/catalog/status', {
    auth: 'secret',
    noSearch: 'Invalid query.',
    handler: async ({api, secret, json}) => json(200, await api.catalogStatus(secret)),
  });
  add('GET', '/api/catalog/search-index', {
    auth: 'secret',
    noSearch: 'Invalid query.',
    handler: async ({api, secret, json}) => json(200, await api.catalogSearchIndex(secret)),
  });
  add('GET', '/api/catalog/search', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) => {
      requireParams(url.searchParams, ['q', 'offset', 'limit'], []);
      const query = url.searchParams.get('q') ?? '';
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 25);
      if (query.length > 200 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        fail(400, 'Invalid search.');
      }
      return json(200, await api.searchCatalog(secret, {query, offset, limit}));
    },
  });
  add('GET', '/api/catalog/food', {
    auth: 'secret',
    handler: async ({api, secret, url, json}) => {
      requireParams(url.searchParams, ['id'], []);
      return json(200, await api.readCatalogFood(secret, string(url.searchParams.get('id'), 1, 1000)));
    },
  });
  add('GET', '/api/media', {
    auth: 'secret',
    handler: async ({api, secret, url, headers}) => {
      requireParams(url.searchParams, ['namespace', 'id'], []);
      const id = string(url.searchParams.get('id'), 1, 1000);
      const namespace = url.searchParams.get('namespace');
      if (!['meal_photos', 'note_photos', 'progress_photos'].includes(namespace) || !/^([a-f0-9]{64})$/.test(id)) {
        fail(400, 'Invalid image.');
      }
      const bytes = await api.readMedia(secret, namespace, id);
      headers.set('Content-Type', 'image/jpeg');
      return new Response(bytes, {headers});
    },
  });
}

function buildRoutes() {
  const map = new Map();
  const add = (method, path, spec) => map.set(`${method} ${path}`, spec);
  registerAccountRoutes(add);
  registerDeletionRoutes(add);
  registerOfflineAndReminderRoutes(add);
  registerHealthAndSharingRoutes(add);
  registerImportAndPhotoRoutes(add);
  registerBackupAndLibraryRoutes(add);
  registerDiaryAndReportRoutes(add);
  registerRecordsAndCatalogRoutes(add);
  return map;
}

const ROUTES = buildRoutes();

function resolveErrorCode(error, path, status) {
  if (error.errorCode) return error.errorCode;
  if (path === '/api/auth/login' && status === 401) return 'auth.invalidCredentials';
  if (path === '/api/auth/register' && status === 409) return 'auth.accountExists';
  if (['/api/auth/reset', '/api/auth/verify'].includes(path) && [400, 401].includes(status)) return 'auth.invalidLink';
  return DEFAULT_CODES[status] ?? (status >= 500 ? 'request.unavailable' : 'request.failed');
}

function resolveErrorDetail(error) {
  if (typeof error.nutritionLabelCode === 'string') {
    const keys = ['field', 'nutrientId', 'percent', 'profileId', 'min', 'max'];
    return {
      kind: 'nutritionLabel',
      code: error.nutritionLabelCode,
      details: Object.fromEntries(keys.filter(key => Object.hasOwn(error.details ?? {}, key)).map(key => [key, error.details[key]])),
    };
  }
  if (typeof error.vitaminActivityCode === 'string') {
    return {kind: 'vitaminActivity', code: error.vitaminActivityCode};
  }
  return undefined;
}

function formatErrorResponse(error, path) {
  const status = STATUS_CODES.has(error.code) ? error.code : 503;
  const conflictMessage =
    path === '/api/auth/register'
      ? 'An account with these details already exists. Try signing in.'
      : DEFAULT_MESSAGES[409];
  const message = error.publicMessage ?? (status === 409 ? conflictMessage : DEFAULT_MESSAGES[status]) ?? 'Request failed.';
  const errorDetail = resolveErrorDetail(error);
  return {
    status,
    payload: {error: message, errorCode: resolveErrorCode(error, path, status), ...(errorDetail ? {errorDetail} : {})},
  };
}

function handleStaticOrHealth({req, path, assets, headers, json}) {
  if (req.method !== 'GET') return null;
  if (path === '/healthz') return json(200, {status: 'ok', service: 'nourishing-cloud-accounts'});
  // App launches may omit Strict cookies on navigation; same-origin fetch includes them.
  if (path === '/api/account/session-context') {
    return json(200, {sessionContext: sessionContext(readSession(req.headers.get('cookie') ?? ''))});
  }
  if (path.startsWith('/api/')) return null;
  const asset = assets.get(path) || (SPA_PATHS.has(path) ? assets.get('/') : undefined);
  if (!asset) fail(404, 'Not found.');
  headers.set('Content-Type', asset.type);
  const body =
    path === '/diary'
      ? String(asset.body).replace(
          '<head>',
          '<head><meta name="nourishing-session" content="' + sessionContext(readSession(req.headers.get('cookie') ?? '')) + '">',
        )
      : asset.body;
  return new Response(body, {headers});
}

function validateMethodAndHeaders(req, config) {
  if (!ALLOWED_METHODS.has(req.method)) fail(405, 'Method not allowed.');
  if (req.method === 'GET') return;
  if (req.headers.get('origin') !== config.origin) fail(403, 'Request origin not allowed.');
  if (req.headers.get('content-type')?.split(';')[0] !== 'application/json') fail(415, 'Use JSON.');
}

async function executeMatchedRoute({route, api, secret, req, url, headers, json}) {
  if (route.auth === 'prebody') {
    if (!secret) fail(401, 'Please sign in.');
    await (api.authenticate ?? api.current)(secret);
  } else if (route.auth === 'secret' && !secret) {
    fail(401, 'Please sign in.');
  }
  if (route.noSearch && url.search) fail(400, route.noSearch);
  const body = req.method === 'GET' ? null : await readBody(req, route.maxBytes ?? DEFAULT_BODY_BYTES);
  return route.handler({api, secret, req, url, body, headers, json});
}

export function createWebHandler({config, service, serviceForRequest, assets = new Map()}) {
  return async req => {
    const headers = new Headers();
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('Content-Security-Policy', CSP_HEADER);
    const json = (status, value) => {
      headers.set('Content-Type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify(value), {status, headers});
    };

    let path = '';
    try {
      const url = new URL(req.url, config.origin);
      path = url.pathname;
      const staticResponse = handleStaticOrHealth({req, path, assets, headers, json});
      if (staticResponse) return staticResponse;

      validateMethodAndHeaders(req, config);
      const route = ROUTES.get(`${req.method} ${path}`);
      if (!route) fail(404, 'Not found.');

      const secret = readSession(req.headers.get('cookie') ?? '');
      const api = service ?? serviceForRequest(req);
      const runInScope = typeof api?.withRequest === 'function' ? fn => api.withRequest(fn) : fn => fn();
      return await runInScope(() => executeMatchedRoute({route, api, secret, req, url, headers, json}));
    } catch (error) {
      const {status, payload} = formatErrorResponse(error, path);
      if (status >= 500 && !STATUS_CODES.has(error.code)) {
        console.error('[http]', req.method, path, status, error?.stack ?? error?.message ?? error);
        void captureServerError(error, {service: 'web', method: req.method, path, status});
      }
      return json(status, payload);
    }
  };
}

export function createHandler(options) {
  const handle = createWebHandler(options);
  return async (req, res) => {
    const request = new Request(new URL(req.url, options.config.origin), {
      method: req.method,
      headers: req.headers,
      ...(['GET', 'HEAD'].includes(req.method) ? {} : {body: Readable.toWeb(req), duplex: 'half'}),
    });
    const response = await handle(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}
