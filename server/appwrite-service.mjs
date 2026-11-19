import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {Client, Functions, Account, Users, TablesDB, Storage, ID, Permission, Role, Query} from 'node-appwrite';
import {pauseLifeView} from './pause-life-settings.mjs';
import {editAccount} from './account-edit.mjs';
import {diaryCalendarView} from './diary-calendar-view.mjs';
import {displayView} from './display-settings.mjs';
import {previewLibraryEdit, validateLibraryEdit} from './library-edit.mjs';
import {foodCopyView, validateFoodCopySelection} from './food-copy.mjs';
import {previewFoodMultiAdd, validateFoodMultiInput} from './food-multi-add.mjs';
import {glucoseView, cycleView, previewCycleImport, previewCycleRemoval} from './health-controls.mjs';
import {createReminderScheduleStore} from './reminder-schedules-store.mjs';
import {createReminderDispatcher} from './reminder-schedules-dispatch.mjs';
import {createWebPushStore} from './web-push-store.mjs';
import {parseTextFoodLog} from './text-log.mjs';
import {createFastingDispatcher} from './scheduler-dispatch.mjs';
import {createCsvImportStore} from './csv-import-store.mjs';
import {favoriteView} from './library-extras.mjs';
import {createAccountLifecycle} from './account-lifecycle.mjs';
import {createAccountDeletion} from './account-deletion.mjs';
import {AccountOperationClient, withinAccountOperation} from './account-operation-context.mjs';
import {confirmAccountPassword} from './account-password.mjs';
import {prepareNotePhoto, validateNotePhotoAction, NOTE_MEDIA_NAMESPACE} from './note-photos.mjs';
import {nutrientDetail, reportNutrientDetail} from './nutrient-detail.mjs';
import {diaryToolsReview, diaryEnergy} from './diary-tools.mjs';
import {printReportOptions, previewPrintReport} from './print-report.mjs';
import {lookupBarcode, searchBranded, previewBarcode, validateBarcodeLookup, validateBrandedSearch} from './barcode.mjs';
import {takeBrandedBudget, takePhotoAnalyzeBudget, takeRecipeImportBudget} from './provider-budget.mjs';
import {entryAdjustmentView, previewEntryAdjustment} from './entry-adjustments.mjs';
import {exportLibraryItem, previewSharedImport, previewFoodPrint} from './library-sharing.mjs';
import {coachView, coachAnswer} from './coach-view.mjs';
import {dashboardView} from './dashboard-view.mjs';
import {libraryToolsView} from './library-tools.mjs';
import {createBackupStore} from './backup-store.mjs';
import {profileSettingsView} from './profile-settings.mjs';
import {snapshotsView, prepareSnapshot, SNAPSHOT_MEDIA_NAMESPACE} from './snapshots.mjs';
import {importRecipeUrl, previewRecipeImport, prepareRecipeImportDraft, recipeImportCatalog} from './recipe-import.mjs';
import {fastingView} from './fasting.mjs';
import {createCloudPhotoAnalyzer} from './cloud-photo.mjs';
import {validateStoredPhoto} from './domain/photo-images.mjs';
import {stagePhotoMedia} from './photo-storage.mjs';
import {loadCatalogIndex} from './catalog-index.mjs';
import {searchCloudFoods} from './food-search.mjs';
import {
  foodInsightOptions,
  foodOracle,
  foodSuggestions,
  previewFoodSuggestion,
  previewFoodInsightIngredient,
  resolveFoodInsightIngredient,
} from './food-insights.mjs';
import {createDataRepository} from './data-repository.mjs';
import {createWorkspaceStore} from './workspace-store.mjs';
import {previewDiaryItem, captureCatalogFood} from './domain/workspace.mjs';
import {
  validateAction,
  validateLibraryPreview,
  previewLibrary,
  readActionFoods,
  captureActionFoods,
} from './workspace-commands.mjs';
import {libraryView, libraryItem} from './library-view.mjs';
import {nutrientTargetsView, targetView, reportView} from './nutrition-views.mjs';
import {csvReport} from './chart-view.mjs';
import {chartSurfaceView} from './dashboard-pinned-charts.mjs';
import {repeatView} from './repeat-view.mjs';
import {recordOptions, recordView, exerciseSearch, exerciseEstimateView, exerciseCatalogView} from './record-views.mjs';
import {targetPolicyView, previewTargetPolicy, previewMacroTemplate} from './target-policy-view.mjs';
import {captureCalendar} from './domain/calendar.mjs';

const INDEPENDENT_METHODS = new Set([
  'withRequest',
  'authenticate',
  'login',
  'register',
  'logout',
  'requestRecovery',
  'resetPassword',
  'verifyEmail',
  'prepareAccountDeletion',
  'confirmAccountDeletion',
  'accountDeletionStatus',
]);

const REMINDER_MUTATION_METHODS = new Set([
  'workspaceCommand',
  'offlineCommand',
  'restoreBackup',
  'importCsv',
  'barcodeSave',
  'savePhoto',
  'saveNotePhoto',
  'saveSnapshot',
  'saveReminder',
  'deleteReminder',
  'reminderSettings',
  'subscribePush',
  'unsubscribePush',
  'testPush',
]);

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasExactKeys = (value, keys) =>
  isPlainObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hasAllowedKeys = (value, allowed) => isPlainObject(value) && Object.keys(value).every(key => allowed.includes(key));

async function reviewedPhoto(value) {
  try {
    return await validateStoredPhoto(value);
  } catch (error) {
    if (error.status === 400) throw Object.assign(error, {code: 400, publicMessage: 'Choose a valid reviewed photo.'});
    throw error;
  }
}

function mapViewError(error, statuses = [400, 404, 409]) {
  if (statuses.includes(error.status)) throw Object.assign(error, {code: error.status, publicMessage: error.message});
  throw error;
}

function parseNotePhotoInput(input) {
  const invalid = () => {
    throw Object.assign(Error('Invalid note fields.'), {code: 400, publicMessage: 'Invalid note fields.'});
  };
  if (!hasExactKeys(input, ['requestId', 'revision', 'id', 'recordRevision', 'fields', 'photo'])) invalid();
  const supplied = input.photo;
  const photoKeys = supplied?.mode === 'replace' ? ['mode', 'id', 'dataUrl'] : ['mode'];
  if (!hasExactKeys(supplied, photoKeys)) invalid();
  const payload = {
    id: input.id,
    recordRevision: input.recordRevision,
    fields: input.fields,
    photo: {mode: supplied.mode, ...(supplied.mode === 'replace' ? {id: supplied.id} : {})},
  };
  const action = {type: 'note.photo.save', payload};
  validateNotePhotoAction(action);
  return {supplied, action};
}

async function dispatchPostMutationJobs({config, key, accountId, name, input}) {
  const scheduleChanged =
    ['restoreBackup', 'importCsv'].includes(name) ||
    (name === 'workspaceCommand' && /^(?:fast|fasting)\./.test(input[0]?.type ?? ''));
  if (process.env.SCHEDULER_ENABLED === 'true' && scheduleChanged) {
    const queueClient = new Client().setEndpoint(config.endpoint).setProject(config.project).setKey(key);
    try {
      await createFastingDispatcher({db: new TablesDB(queueClient), functions: new Functions(queueClient)}).dispatch(accountId);
    } catch {
      console.warn('Fasting delivery remains queued for repair.');
    }
  }
  if (process.env.REMINDERS_ENABLED === 'true' && REMINDER_MUTATION_METHODS.has(name)) {
    const queueClient = new Client().setEndpoint(config.endpoint).setProject(config.project).setKey(key);
    try {
      await createReminderDispatcher({db: new TablesDB(queueClient), functions: new Functions(queueClient)}).dispatch(accountId);
    } catch {
      console.warn('Reminder delivery remains queued for repair.');
    }
  }
}

async function enforceLoginBudget(db, database, email) {
  const now = Date.now();
  const hour = Math.floor(now / 3600000);
  const rowId = createHash('sha256').update(`${hour}:${email.trim().toLowerCase()}`).digest('hex').slice(0, 32);
  const args = {databaseId: database, tableId: 'login_limits', rowId};
  let row;
  try {
    row = await db.createRow({
      ...args,
      data: {attempts: 1, expiresAt: new Date((hour + 2) * 3600000).toISOString()},
      permissions: [],
    });
  } catch (error) {
    if (error.code !== 409) throw error;
    row = await db.incrementRowColumn({...args, column: 'attempts', value: 1});
  }
  if (row.attempts > 20) throw Object.assign(Error('Too many sign-in attempts. Try again later.'), {code: 429});
  // Bound retention without a process-local timer. Never retain email addresses in this table.
  const expired = await db.listRows({
    databaseId: database,
    tableId: 'login_limits',
    queries: [Query.lessThan('expiresAt', new Date(now).toISOString()), Query.limit(25)],
  });
  for (const item of expired.rows) {
    try {
      await db.deleteRow({...args, rowId: item.$id});
    } catch (error) {
      if (error.code !== 404) throw error;
    }
  }
}

function buildAuthAndLifecycleMethods(ctx) {
  const {config, requestScope, anonymous, elevated, session, resolveAccount, ensureProfile, profileArgs, profileData, lifecycle, deletion, budget, login} = ctx;
  return {
    withRequest: fn => requestScope.run({accounts: new Map(), profiles: new Map()}, fn),
    authenticate: async secret => {
      await resolveAccount(secret);
    },
    prepareAccountDeletion: async (secret, {password}) => {
      const account = await resolveAccount(secret);
      await confirmAccountPassword({account, password, budget, auth: new Account(elevated()), users: new Users(elevated())});
      return deletion().prepare(account.$id);
    },
    confirmAccountDeletion: async (secret, ticket) => deletion().begin(ticket, (await resolveAccount(secret)).$id),
    accountDeletionStatus: async ticket => deletion().status(ticket, {advance: true}),
    updateAccount: async (secret, input) => editAccount(new Account(session(secret)), input),
    login,
    register: async ({email, password, name}) => {
      const account = await anonymous().create({userId: ID.unique(), email, password, name});
      await lifecycle().initialize(account.$id);
      return login({email, password});
    },
    current: async secret => {
      const account = await resolveAccount(secret);
      return {
        id: account.$id,
        email: account.email,
        name: account.name,
        emailVerified: account.emailVerification,
        profile: await ensureProfile(secret, account),
      };
    },
    updateProfile: async (secret, profileInput) => {
      const account = await resolveAccount(secret);
      await ensureProfile(secret, account);
      const updated = profileData(await new TablesDB(elevated()).updateRow({...profileArgs(account.$id), data: profileInput}));
      requestScope.getStore()?.profiles.set(`${secret}:${account.$id}`, updated);
      return updated;
    },
    logout: async secret => {
      if (secret) await new Account(session(secret)).deleteSession({sessionId: 'current'});
    },
    requestRecovery: async ({email}) => {
      try {
        await anonymous().createRecovery({email, url: `${config.origin}/reset-password`});
      } catch (error) {
        if (!['user_not_found', 'user_invalid_credentials'].includes(error.type)) throw error;
      }
    },
    resetPassword: async resetInput => {
      await anonymous().updateRecovery(resetInput);
    },
    requestVerification: async secret => {
      await new Account(session(secret)).createVerification({url: `${config.origin}/verify-email`});
    },
    verifyEmail: async verifyInput => {
      await anonymous().updateVerification(verifyInput);
    },
  };
}

function buildMediaAndPhotoMethods(ctx) {
  const {data, readView, elevated, catalogReader} = ctx;
  return {
    snapshots: secret => readView(secret, snapshotsView),
    prepareNotePhoto: async (secret, input) => {
      await data(secret);
      return prepareNotePhoto(input);
    },
    saveNotePhoto: async (secret, input) => {
      const {supplied, action} = parseNotePhotoInput(input);
      const {owner, repository} = await data(secret);
      const db = new TablesDB(elevated());
      const storage = new Storage(elevated());
      const photo = supplied.mode === 'replace' ? await reviewedPhoto({id: supplied.id, dataUrl: supplied.dataUrl}) : null;
      return createWorkspaceStore(db, owner).command(
        {requestId: input.requestId, revision: input.revision, ...action},
        catalogReader(repository),
        photo ? {photo, stageMedia: c => stagePhotoMedia({db, storage, owner, photo, namespace: NOTE_MEDIA_NAMESPACE, ...c})} : {},
      );
    },
    prepareSnapshot: (secret, input) => readView(secret, state => prepareSnapshot(state, input)),
    saveSnapshot: async (secret, input) => {
      const allowed = ['requestId', 'revision', 'photo', 'date', 'time', 'title', 'note', 'vitals', 'captureMeasurements'];
      if (!hasAllowedKeys(input, allowed)) throw Object.assign(Error('Invalid snapshot fields.'), {code: 400});
      const {owner, repository} = await data(secret);
      const db = new TablesDB(elevated());
      const storage = new Storage(elevated());
      const photo = await reviewedPhoto(input.photo);
      const {requestId, revision, photo: ignored, ...metadata} = input;
      return createWorkspaceStore(db, owner).command(
        {requestId, revision, type: 'snapshot.add', payload: {photoId: photo.id, ...metadata}},
        catalogReader(repository),
        {photo, stageMedia: c => stagePhotoMedia({db, storage, owner, photo, namespace: SNAPSHOT_MEDIA_NAMESPACE, ...c})},
      );
    },
    analyzePhoto: async (secret, input, signal) => {
      const {owner, repository, storage} = await data(secret);
      await takePhotoAnalyzeBudget(new TablesDB(elevated()), {database: ctx.config.database, owner});
      await createWorkspaceStore(new TablesDB(elevated()), owner).create();
      const [state, catalogHead] = await Promise.all([
        repository.readState(),
        new TablesDB(ctx.session(secret))
          .getRow({databaseId: ctx.config.database, tableId: 'catalog_heads', rowId: 'active'})
          .catch(() => null),
      ]);
      let search = (query, {limit}) => repository.search({query, limit, offset: 0});
      if (catalogHead) {
        try {
          const catalog = await loadCatalogIndex({
            storage,
            head: catalogHead,
            namespace: ctx.config.endpoint + '/' + ctx.config.project,
          });
          const fastCatalog = recipeImportCatalog(catalog);
          search = (query, {limit}) => fastCatalog.search(query, {limit, offset: 0});
        } catch {
          // Fall back to TablesDB search if the compact catalog index is unavailable.
        }
      }
      return createCloudPhotoAnalyzer().analyze(input, {
        owner,
        foods: state.foods,
        signal,
        search,
      });
    },
    savePhoto: async (secret, input) => {
      const allowed = ['requestId', 'revision', 'photo', 'reviewToken', 'date', 'time', 'group', 'rows', 'destination'];
      if (!hasAllowedKeys(input, allowed)) {
        throw Object.assign(Error('Invalid photo fields.'), {code: 400, publicMessage: 'Invalid photo fields.'});
      }
      const {owner, repository} = await data(secret);
      const db = new TablesDB(elevated());
      const storage = new Storage(elevated());
      const photo = await reviewedPhoto(input.photo);
      const {requestId, revision, reviewToken, date, time, group, rows, destination} = input;
      return createWorkspaceStore(db, owner).command(
        {
          requestId,
          revision,
          type: 'photo.log',
          payload: {photoId: photo.id, reviewToken, date, time, group, rows, ...(destination === undefined ? {} : {destination})},
        },
        catalogReader(repository),
        {
          owner,
          reviewSecret: process.env.PHOTO_REVIEW_SECRET,
          photo,
          stageMedia: c => stagePhotoMedia({db, storage, owner, photo, ...c}),
        },
      );
    },
    readMedia: async (secret, namespace, id) => {
      const {repository, storage} = await data(secret);
      const collection = namespace === 'progress_photos' ? 'progressSnapshots' : namespace === NOTE_MEDIA_NAMESPACE ? 'notes' : null;
      if (collection && !((await repository.readState())[collection] ?? []).some(row => row.imageId === id)) {
        throw Object.assign(Error('Photo not found.'), {code: 404});
      }
      const fileId = await repository.media(namespace, id);
      return storage.getFileView({bucketId: 'private-media', fileId});
    },
  };
}

function buildLibraryAndSearchMethods(ctx) {
  const {config, data, readView, insights, elevated, catalogReader} = ctx;
  return {
    barcodeLookup: async (secret, input) => {
      const {owner} = await data(secret);
      validateBarcodeLookup(input);
      await takeBrandedBudget(new TablesDB(elevated()), {database: config.database, owner, operation: 'product'});
      return readView(secret, state => lookupBarcode(state, input, {owner, reviewSecret: process.env.PHOTO_REVIEW_SECRET}));
    },
    brandedSearch: async (secret, input) => {
      const {owner} = await data(secret);
      validateBrandedSearch(input);
      await takeBrandedBudget(new TablesDB(elevated()), {database: config.database, owner, operation: 'search'});
      return searchBranded(input);
    },
    barcodePreview: async (secret, input) => {
      const {owner} = await data(secret);
      return readView(secret, state => previewBarcode(state, input, {owner, reviewSecret: process.env.PHOTO_REVIEW_SECRET}));
    },
    barcodeSave: async (secret, input) => {
      const {owner, repository} = await data(secret);
      if (input?.type !== 'barcode.log') throw Object.assign(Error('Choose a barcode action.'), {code: 400});
      return createWorkspaceStore(new TablesDB(elevated()), owner).command(input, catalogReader(repository), {
        owner,
        reviewSecret: process.env.PHOTO_REVIEW_SECRET,
      });
    },
    libraryShare: (secret, input) => readView(secret, state => exportLibraryItem(state, input)),
    librarySharePreview: (secret, input) => readView(secret, state => previewSharedImport(state, input)),
    libraryFoodPrint: async (secret, input) => {
      const {owner} = await data(secret);
      return readView(secret, state => ({...previewFoodPrint(state, input), accountId: owner}));
    },
    favorites: secret => readView(secret, favoriteView),
    libraryTools: (secret, input) => readView(secret, state => libraryToolsView(state, input)),
    library: async secret => {
      const {owner, repository} = await data(secret);
      await createWorkspaceStore(new TablesDB(elevated()), owner).create();
      return libraryView(await repository.readState());
    },
    foodCopy: async (secret, selection) => {
      validateFoodCopySelection(selection);
      const {owner, repository} = await data(secret);
      const state = await repository.readState();
      const catalogFoods = selection.kind === 'catalog' ? new Map([[selection.id, (await repository.food(selection.id)).food]]) : new Map();
      try {
        return foodCopyView(state, selection, {owner, catalogFoods});
      } catch (error) {
        mapViewError(error);
      }
    },
    libraryItem: async (secret, kind, id, entryId) => {
      const {repository} = await data(secret);
      const state = await repository.readState();
      const entry = entryId ? state.entries.find(row => row.id === entryId) : null;
      if (entryId && !entry) throw Object.assign(Error('This diary entry no longer exists.'), {code: 404});
      const resource = state[kind + 's'].find(row => row.id === id) ?? (kind === 'food' ? (await repository.food(id)).food : null);
      const viewState =
        kind === 'food' && !state.foods.some(row => row.id === id) ? {...state, foods: [...state.foods, resource]} : state;
      return {
        ...libraryItem(viewState, kind, resource, entry),
        ...(kind === 'food' ? {copySelection: {kind: state.foods.some(row => row.id === id) ? 'library' : 'catalog', id}} : {}),
      };
    },
    previewLibraryEdit: async (secret, input) => {
      validateLibraryEdit(input);
      const {owner, repository} = await data(secret);
      const state = await repository.readState();
      const catalogFoods = await readActionFoods({type: 'library.edit', payload: input}, catalogReader(repository));
      try {
        return previewLibraryEdit(state, input, {owner, catalogFoods});
      } catch (error) {
        mapViewError(error, [400, 401, 404, 409]);
      }
    },
    previewLibrary: async (secret, input) => {
      const action = validateLibraryPreview(input);
      const {repository} = await data(secret);
      const state = await repository.readState();
      const prepared = captureActionFoods(state, action, await readActionFoods(action, catalogReader(repository)));
      return previewLibrary(state, {...input, draft: prepared.payload});
    },
    previewFoodMultiAdd: async (secret, input) => {
      validateFoodMultiInput(input);
      const {owner, repository} = await data(secret);
      const state = await repository.readState();
      const catalogFoods = await readActionFoods({type: 'food.multi.add', payload: input}, catalogReader(repository));
      try {
        return previewFoodMultiAdd(state, input, {owner, catalogFoods});
      } catch (error) {
        mapViewError(error, [400, 401, 404, 409]);
      }
    },
    catalogStatus: async secret => (await data(secret)).repository.catalogStatus(),
    searchCatalog: async (secret, input) => (await data(secret)).repository.search(input),
    foodSearch: (secret, input) => insights(secret, input, searchCloudFoods),
    readCatalogFood: async (secret, id) => (await data(secret)).repository.food(id),
    importRecipe: async (secret, input) => {
      if (typeof input?.url === 'string' && input.url.trim()) {
        const {owner} = await data(secret);
        await takeRecipeImportBudget(new TablesDB(elevated()), {database: config.database, owner});
      }
      return insights(secret, input, importRecipeUrl);
    },
    recipeImportDraft: (secret, input) => insights(secret, input, prepareRecipeImportDraft),
    previewRecipeImport: (secret, input) => insights(secret, input, previewRecipeImport),
    foodInsightOptions: secret => readView(secret, state => foodInsightOptions(state)),
    foodOracle: (secret, input) => insights(secret, input, foodOracle),
    foodSuggestions: (secret, input) => insights(secret, input, foodSuggestions),
    resolveFoodInsightIngredient: (secret, input) => insights(secret, input, resolveFoodInsightIngredient),
    previewFoodSuggestion: (secret, input) => insights(secret, input, previewFoodSuggestion),
    previewFoodInsightIngredient: (secret, input) => insights(secret, input, previewFoodInsightIngredient),
    parseTextLog: (secret, input) => insights(secret, input, parseTextFoodLog),
  };
}

function buildDiaryAndViewMethods(ctx) {
  const {data, readView, calendarContext, resolveAccount, ensureProfile, elevated, catalogReader, pushStore, reminderStore, csvImports, backups} = ctx;
  return {
    nutrientDetail: (secret, input) => readView(secret, state => nutrientDetail(state, input)),
    reportNutrientDetail: async (secret, input) => {
      const {owner} = await data(secret);
      const calendar = await calendarContext(secret, owner);
      return readView(secret, state => reportNutrientDetail(state, input, {now: new Date(calendar.asOf), timeZone: calendar.timeZone}));
    },
    diaryCalendar: async (secret, input) => {
      const {owner} = await data(secret);
      const calendar = await calendarContext(secret, owner);
      return readView(secret, state => diaryCalendarView(state, input, calendar));
    },
    diaryToolsReview: (secret, input) => readView(secret, state => diaryToolsReview(state, input)),
    printReportOptions: async secret => {
      const {owner} = await data(secret);
      return readView(secret, state => ({...printReportOptions(state), accountId: owner}));
    },
    previewPrintReport: async (secret, input) => {
      const {owner} = await data(secret);
      const calendar = await calendarContext(secret, owner);
      return readView(secret, state => ({
        ...previewPrintReport(state, input, {now: new Date(calendar.asOf), timeZone: calendar.timeZone}),
        accountId: owner,
      }));
    },
    glucoseTimeline: async (secret, input) => {
      const {owner} = await data(secret);
      const calendar = await calendarContext(secret, owner);
      return readView(secret, state => glucoseView(state, input, {now: new Date(calendar.asOf), timeZone: calendar.timeZone}));
    },
    cycleView: async (secret, input) => {
      const {owner} = await data(secret);
      const calendar = await calendarContext(secret, owner);
      return readView(secret, state => cycleView(state, input, {now: new Date(calendar.asOf), timeZone: calendar.timeZone}));
    },
    cycleImportPreview: (secret, input) => readView(secret, state => previewCycleImport(state, input)),
    cycleRemovalPreview: (secret, input) => readView(secret, state => previewCycleRemoval(state, input)),
    coachPreferences: secret => readView(secret, coachView),
    coachAnswer: (secret, input) => readView(secret, state => coachAnswer(state, input)),
    dashboard: async (secret, date) => {
      const {owner} = await data(secret);
      const context = await calendarContext(secret, owner);
      return readView(secret, state => dashboardView(state, {date}, context));
    },
    offlineSnapshot: async secret => {
      const {owner} = await data(secret);
      const store = createWorkspaceStore(new TablesDB(elevated()), owner);
      await store.create();
      return store.offlineSnapshot();
    },
    offlineCommand: async (secret, input) => {
      const {owner} = await data(secret);
      const calendar = await calendarContext(secret, owner);
      return createWorkspaceStore(new TablesDB(elevated()), owner).offlineCommand(input, calendar);
    },
    reminders: async secret => ({...(await (await pushStore(secret)).status()), ...(await (await reminderStore(secret)).status())}),
    saveReminder: async (secret, input) => (await reminderStore(secret)).save(input),
    deleteReminder: async (secret, input) => (await reminderStore(secret)).remove(input),
    reminderSettings: async (secret, input) => (await reminderStore(secret)).settings(input),
    subscribePush: async (secret, input) => (await pushStore(secret)).subscribe(input),
    unsubscribePush: async (secret, input) => (await pushStore(secret)).unsubscribe(input),
    testPush: async (secret, input) => (await pushStore(secret)).test(input),
    previewCsvImport: async (secret, input) => (await csvImports(secret)).preview(input),
    importCsv: async (secret, input) => (await csvImports(secret)).import(input),
    exportBackup: async secret => (await backups(secret)).export(),
    listRecoveries: async secret => (await backups(secret)).listRecoveries(),
    inspectRecovery: async (secret, input) => (await backups(secret)).inspectRecovery(input),
    inspectBackup: async (secret, input) => (await backups(secret)).inspect(input),
    uploadBackupMedia: async (secret, input) => (await backups(secret)).upload(input),
    restoreBackup: async (secret, input) => (await backups(secret)).restore(input),
    profileSettings: (secret, date) => readView(secret, state => profileSettingsView(state, date)),
    fasting: async (secret, input) => {
      const {owner} = await data(secret);
      const context = await calendarContext(secret, owner);
      return readView(secret, state => fastingView(state, context, input));
    },
    previewTargetPolicy: async (secret, input) => {
      const {owner} = await data(secret);
      const context = await calendarContext(secret, owner);
      return readView(secret, state => previewTargetPolicy(state, input, context));
    },
    targetTemplatePreview: (secret, input) => readView(secret, state => previewMacroTemplate(state, input)),
    targetPolicies: async (secret, date) => {
      const {owner} = await data(secret);
      const context = await calendarContext(secret, owner);
      return readView(secret, state => targetPolicyView(state, date, context));
    },
    repeats: (secret, date) => readView(secret, state => repeatView(state, date)),
    exerciseCatalog: async secret => {
      await data(secret);
      return exerciseCatalogView();
    },
    pauseLife: secret => readView(secret, pauseLifeView),
    display: secret => readView(secret, state => displayView(state)),
    recordOptions: (secret, date) => readView(secret, state => recordOptions(state, date)),
    recordItem: (secret, input) => readView(secret, state => recordView(state, input)),
    exercises: async (secret, input) => {
      await data(secret);
      return exerciseSearch(input);
    },
    exerciseEstimate: (secret, input) => readView(secret, state => exerciseEstimateView(state, input)),
    charts: async (secret, input) => {
      const {owner} = await data(secret);
      const calendar = await calendarContext(secret, owner);
      return readView(secret, state => chartSurfaceView(state, input, {now: new Date(calendar.asOf), timeZone: calendar.timeZone}));
    },
    exportReport: (secret, input) => readView(secret, state => csvReport(state, input)),
    nutrientTargets: (secret, date) => readView(secret, state => nutrientTargetsView(state, date)),
    targets: async (secret, date) => {
      const {owner, repository} = await data(secret);
      await createWorkspaceStore(new TablesDB(elevated()), owner).create();
      return targetView(await repository.readState(), date);
    },
    nutritionReport: async (secret, options) => {
      const {owner, repository} = await data(secret);
      await createWorkspaceStore(new TablesDB(elevated()), owner).create();
      const profile = await ensureProfile(secret, await resolveAccount(secret));
      return reportView(await repository.readState(), options, {timeZone: profile.timeZone});
    },
    readDiary: async (secret, date) => {
      const {owner, repository} = await data(secret);
      await createWorkspaceStore(new TablesDB(elevated()), owner).create();
      const calendar = await calendarContext(secret, owner);
      return repository.diary(date, {now: new Date(calendar.asOf), timeZone: calendar.timeZone});
    },
    workspaceCommand: async (secret, input) => {
      const {owner, repository} = await data(secret);
      return createWorkspaceStore(new TablesDB(elevated()), owner).command(
        input,
        catalogReader(repository),
        await calendarContext(secret, owner),
      );
    },
    entryAdjustment: (secret, input) => readView(secret, state => entryAdjustmentView(state, input)),
    previewEntryAdjustment: async (secret, payload) => {
      const action = {type: 'entry.ingredients.adjust', payload};
      validateAction(action);
      const {repository} = await data(secret);
      const state = await repository.readState();
      const prepared = captureActionFoods(state, action, await readActionFoods(action, catalogReader(repository)));
      try {
        return previewEntryAdjustment(state, prepared.payload);
      } catch (error) {
        mapViewError(error);
      }
    },
    previewDiary: async (secret, payload) => {
      const {repository} = await data(secret);
      const state = await repository.readState();
      validateAction({type: payload?.id ? 'entry.update' : 'entry.add', payload});
      const p = {...payload};
      try {
        if (p.foodId && !state.foods.some(row => row.id === p.foodId)) {
          p.foodId = captureCatalogFood(state, (await repository.food(p.foodId)).food).id;
        }
        const preview = previewDiaryItem(state, p);
        return {...preview, energy: diaryEnergy(state, preview.nutrition.totals.calories)};
      } catch (error) {
        mapViewError(error, [400, 409]);
      }
    },
  };
}

export function createAppwriteService(config, key, userAgent = '') {
  const requestScope = new AsyncLocalStorage();
  const client = () =>
    new AccountOperationClient()
      .setEndpoint(config.endpoint)
      .setProject(config.project)
      .setForwardedUserAgent(userAgent);
  const anonymous = () => new Account(client());
  const elevated = () => {
    if (!key) throw Object.assign(Error('Cloud credentials unavailable.'), {code: 503});
    return client().setKey(key);
  };
  const session = secret => {
    if (!secret) throw Object.assign(Error('Sign in.'), {code: 401});
    return client().setSession(secret);
  };
  const profileArgs = id => ({databaseId: config.database, tableId: config.profileTable, rowId: id});
  const profileData = row => ({timeZone: row.timeZone, units: row.units});

  async function resolveAccount(secret) {
    const store = requestScope.getStore();
    if (store?.accounts.has(secret)) return store.accounts.get(secret);
    const account = await new Account(session(secret)).get();
    store?.accounts.set(secret, account);
    return account;
  }

  async function data(secret) {
    const sessionClient = session(secret);
    const account = await resolveAccount(secret);
    return {
      owner: account.$id,
      repository: createDataRepository(new TablesDB(sessionClient), account.$id),
      storage: new Storage(sessionClient),
    };
  }

  const catalogReader = repository => async id => {
    try {
      return (await repository.food(id)).food;
    } catch (error) {
      if (error.code === 404) return null;
      throw error;
    }
  };

  async function readView(secret, project) {
    const {owner, repository} = await data(secret);
    await createWorkspaceStore(new TablesDB(elevated()), owner).create();
    try {
      return await project(await repository.readState());
    } catch (error) {
      mapViewError(error);
    }
  }

  async function ensureProfile(secret, account) {
    const store = requestScope.getStore();
    const cacheKey = `${secret}:${account.$id}`;
    if (store?.profiles.has(cacheKey)) return store.profiles.get(cacheKey);
    const db = new TablesDB(session(secret));
    const args = profileArgs(account.$id);
    let profile;
    try {
      profile = profileData(await db.getRow(args));
    } catch (error) {
      if (error.code !== 404) throw error;
      try {
        await new TablesDB(elevated()).createRow({
          ...args,
          data: {timeZone: 'UTC', units: 'metric'},
          permissions: [Permission.read(Role.user(account.$id))],
        });
      } catch (createError) {
        if (createError.code !== 409) throw createError;
      }
      profile = profileData(await db.getRow(args));
    }
    store?.profiles.set(cacheKey, profile);
    return profile;
  }

  async function calendarContext(secret, owner) {
    const profile = await ensureProfile(secret, {$id: owner});
    return captureCalendar(new Date(), profile.timeZone);
  }

  const budget = email => enforceLoginBudget(new TablesDB(elevated()), config.database, email);
  const login = async ({email, password}) => {
    await budget(email);
    return new Account(elevated()).createEmailPasswordSession({email, password, duration: 2592000});
  };

  async function insights(secret, input, project) {
    const {owner, repository, storage} = await data(secret);
    await createWorkspaceStore(new TablesDB(elevated()), owner).create();
    const [state, head] = await Promise.all([
      repository.readState(),
      new TablesDB(session(secret)).getRow({databaseId: config.database, tableId: 'catalog_heads', rowId: 'active'}),
    ]);
    const catalog = await loadCatalogIndex({storage, head, namespace: config.endpoint + '/' + config.project});
    try {
      return await project(state, catalog, input);
    } catch (error) {
      mapViewError(error);
    }
  }

  const csvImports = async secret =>
    createCsvImportStore({db: new TablesDB(elevated()), ownerId: (await data(secret)).owner, reviewSecret: process.env.PHOTO_REVIEW_SECRET});

  const vapidConfig = () => ({publicKey: process.env.WEB_PUSH_PUBLIC_KEY, privateKey: process.env.WEB_PUSH_PRIVATE_KEY});
  const pushStore = async secret => {
    const {owner} = await data(secret);
    await createWorkspaceStore(new TablesDB(elevated()), owner).create();
    return createWebPushStore({db: new TablesDB(elevated()), ownerId: owner, origin: config.origin, vapid: vapidConfig()});
  };
  const reminderStore = async secret => {
    const {owner} = await data(secret);
    await createWorkspaceStore(new TablesDB(elevated()), owner).create();
    return createReminderScheduleStore({db: new TablesDB(elevated()), ownerId: owner, origin: config.origin, vapid: vapidConfig()});
  };
  const backups = async secret => {
    const {owner} = await data(secret);
    const server = elevated();
    return createBackupStore({db: new TablesDB(server), storage: new Storage(server), ownerId: owner});
  };

  const lifecycle = () => createAccountLifecycle({db: new TablesDB(elevated()), database: config.database});
  const deletion = () =>
    createAccountDeletion({
      db: new TablesDB(elevated()),
      storage: new Storage(elevated()),
      users: new Users(elevated()),
      lifecycle: lifecycle(),
      database: config.database,
    });

  const ctx = {
    config,
    requestScope,
    anonymous,
    elevated,
    session,
    resolveAccount,
    data,
    catalogReader,
    readView,
    ensureProfile,
    calendarContext,
    profileArgs,
    profileData,
    budget,
    login,
    insights,
    csvImports,
    pushStore,
    reminderStore,
    backups,
    lifecycle,
    deletion,
  };

  const service = {
    ...buildAuthAndLifecycleMethods(ctx),
    ...buildMediaAndPhotoMethods(ctx),
    ...buildLibraryAndSearchMethods(ctx),
    ...buildDiaryAndViewMethods(ctx),
  };

  return Object.fromEntries(
    Object.entries(service).map(([name, method]) => [
      name,
      INDEPENDENT_METHODS.has(name)
        ? method
        : async (secret, ...input) => {
            const execute = async () => {
              const account = await resolveAccount(secret);
              const result = await lifecycle().run(account.$id, name, operation =>
                withinAccountOperation(operation, () => method(secret, ...input)),
              );
              void dispatchPostMutationJobs({config, key, accountId: account.$id, name, input});
              return result;
            };
            return requestScope.getStore()
              ? execute()
              : requestScope.run({accounts: new Map(), profiles: new Map()}, execute);
          },
    ]),
  );
}
