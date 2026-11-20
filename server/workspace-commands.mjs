import {pauseLifeCommandFields, preparePauseLifeCommand} from './pause-life-settings.mjs';
import {displayCommandFields, prepareDisplayCommand} from './display-settings.mjs';
import {libraryDraftFields, validateLibraryDraft, prepareLibraryDraft, libraryDraftRows} from './library-drafts.mjs';
import {validateLibraryEdit, applyLibraryEdit} from './library-edit.mjs';
import {recipePreview} from './library-view.mjs';
import {validateFoodCopy, applyFoodCopy} from './food-copy.mjs';
import {foodEditorLabelView} from './food-editor.mjs';
import {validateFoodMultiInput, foodMultiCatalogReferences, applyFoodMultiAdd} from './food-multi-add.mjs';
import {parseAddMenu} from './domain/add-menu.mjs';
import {diaryDisplayCommandFields, prepareDiaryDisplayCommand} from './diary-display-settings.mjs';
import {healthCommandFields, applyHealthCommand} from './health-controls.mjs';
import {chartDisplayCommandFields, applyChartDisplayCommand} from './dashboard-pinned-charts.mjs';
import {librarySharingCommandFields, validateSharedImport, applySharedImport} from './library-sharing.mjs';
import {coachCommandFields, applyCoachCommand} from './coach-view.mjs';
import {textLogCommandFields, validateTextLog, applyTextLog} from './text-log.mjs';
import {libraryExtrasCommandFields, prepareLibraryExtrasCommand, libraryExtrasCatalogReferences} from './library-extras.mjs';
import {notePhotoCommandFields, validateNotePhotoAction, applyNotePhotoCommand} from './note-photos.mjs';
import {diaryToolCommandFields, applyDiaryToolsCommand} from './diary-tools.mjs';
import {barcodeCommandFields, validateBarcodeAction, applyBarcodeLog} from './barcode.mjs';
import {dashboardCommandFields, applyDashboardCommand} from './dashboard-view.mjs';
import {entryAdjustmentFields, validateEntryAdjustmentAction, prepareEntryAdjustmentCommand} from './entry-adjustments.mjs';
import {libraryToolCommandFields} from './library-tools.mjs';
import {profileSettingsCommandFields, applyProfileSettingsCommand} from './profile-settings.mjs';
import {snapshotCommandFields, validateSnapshotAction, applySnapshotCommand} from './snapshots.mjs';
import {fastingCommandFields, applyFastingCommand} from './fasting.mjs';
import {foodInsightCommandFields, prepareFoodInsightCommand} from './food-insights.mjs';
import {validateMealLog, applyMealLog} from './meal-commands.mjs';
import {photoCommandFields, validatePhotoAction, applyPhotoLog} from './photo-commands.mjs';
import {act, captureCatalogFood, previewLibraryDraft} from './domain/workspace.mjs';
import {repeatCommandFields, validateRepeatAction} from './repeat-commands.mjs';
import {recordCommandFields, applyRecordCommand} from './record-commands.mjs';
import {targetPolicyCommandFields, prepareTargetPolicyCommand} from './target-policy-commands.mjs';
import {invalid} from './request-errors.mjs';

const COMMAND_FIELDS = {
  ...pauseLifeCommandFields,
  ...displayCommandFields,
  ...diaryDisplayCommandFields,
  ...healthCommandFields,
  ...chartDisplayCommandFields,
  ...librarySharingCommandFields,
  ...coachCommandFields,
  ...textLogCommandFields,
  ...libraryExtrasCommandFields,
  ...notePhotoCommandFields,
  ...diaryToolCommandFields,
  ...barcodeCommandFields,
  ...dashboardCommandFields,
  ...entryAdjustmentFields,
  ...libraryToolCommandFields,
  ...profileSettingsCommandFields,
  ...snapshotCommandFields,
  ...repeatCommandFields,
  ...recordCommandFields,
  ...targetPolicyCommandFields,
  ...photoCommandFields,
  ...foodInsightCommandFields,
  ...fastingCommandFields,
  'addMenu.save': ['addMenu'],
  'food.copy': ['selection', 'sourceFingerprint', 'changes'],
  'food.multi.add': ['destination', 'rows', 'reviewToken', 'confirmed'],
  'meal.log': ['date', 'time', 'group', 'rows'],
  'chart.save': ['version', 'id', 'name', 'primary', 'secondary', 'days', 'visible', 'cycleOverlay'],
  'chart.delete': ['id'],
  'chart.visibility': ['id', 'visible'],
  'nutrientTarget.patch': ['date', 'id', 'changes'],
  'nutrientTarget.setCustom': ['date', 'id', 'custom'],
  'preferences.patch': ['theme'],
  'entry.add': ['foodId', 'recipeId', 'mealId', 'date', 'time', 'group', 'amount', 'quantity', 'unit', 'portionId'],
  'entry.update': ['id', 'date', 'time', 'group', 'amount', 'quantity', 'unit', 'portionId'],
  'entry.delete': ['id'],
  'day.complete': ['date', 'completed'],
  'group.rename': ['from', 'to'],
  'note.add': ['date', 'time', 'group', 'text'],
  'note.delete': ['id'],
  'food.save': libraryDraftFields.food,
  'recipe.save': libraryDraftFields.recipe,
  'meal.save': libraryDraftFields.meal,
  'library.edit': ['kind', 'draft', 'reviewToken', 'mode', 'confirmed'],
  'food.delete': ['id'],
  'recipe.delete': ['id'],
  'meal.delete': ['id'],
};

const LIBRARY_SAVE_TYPES = new Set(['food.save', 'recipe.save', 'meal.save']);
const REQUIRED_ID_TYPES = new Set(['entry.update', 'entry.delete', 'note.delete']);
const SKIP_CAPTURE_TYPES = new Set(['food.multi.add', 'food.copy', 'library.edit']);

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isValidRecordId = value => typeof value === 'string' && value.length > 0 && value.length <= 1000;

function rethrowDomainError(error) {
  if ([400, 404, 409].includes(error.status)) {
    throw Object.assign(error, {code: error.status, publicMessage: error.message});
  }
  throw error;
}

const ACTION_VALIDATORS = {
  'note.photo.save': input => validateNotePhotoAction(input),
  'barcode.log': input => validateBarcodeAction(input),
  'photo.log': input => validatePhotoAction(input),
  'food.copy': ({payload}) => validateFoodCopy(payload),
  'library.edit': ({payload}) => validateLibraryEdit(payload, {saving: true}),
  'food.save': ({payload}) => validateLibraryDraft('food', payload),
  'recipe.save': ({payload}) => validateLibraryDraft('recipe', payload),
  'meal.save': ({payload}) => validateLibraryDraft('meal', payload),
  'food.multi.add': ({payload}) => validateFoodMultiInput(payload, {saving: true}),
  'meal.log': ({payload}) => validateMealLog(payload),
  'text.log': ({payload}) => validateTextLog(payload),
  'share.import': ({payload}) => validateSharedImport(payload),
  'preferences.patch': ({payload}) => {
    if (!Object.keys(payload).length || !['light', 'dark', 'system'].includes(payload.theme)) {
      invalid('Choose a theme.');
    }
  },
  'addMenu.save': ({payload}) => {
    if (!payload.addMenu) invalid('Choose menu settings.');
    parseAddMenu(payload.addMenu);
  },
  'entry.add': ({payload}) => {
    const targets = ['foodId', 'recipeId', 'mealId'].filter(k => typeof payload[k] === 'string' && payload[k].length > 0);
    if (targets.length !== 1) invalid('Choose a food.');
  },
};

const GROUP_VALIDATORS = [
  [entryAdjustmentFields, validateEntryAdjustmentAction],
  [snapshotCommandFields, validateSnapshotAction],
  [repeatCommandFields, validateRepeatAction],
];

export function validateAction(input) {
  if (!isPlainObject(input) || Object.keys(input).some(k => !['type', 'payload'].includes(k))) {
    invalid('Invalid diary action.');
  }
  const allowed = Object.hasOwn(COMMAND_FIELDS, input.type) ? COMMAND_FIELDS[input.type] : null;
  const payload = input.payload;
  if (!allowed || !isPlainObject(payload) || Object.keys(payload).some(k => !allowed.includes(k))) {
    invalid('Invalid diary fields.');
  }

  for (const [group, validate] of GROUP_VALIDATORS) {
    if (Object.hasOwn(group, input.type)) validate(input);
  }
  if (Object.hasOwn(ACTION_VALIDATORS, input.type)) {
    ACTION_VALIDATORS[input.type](input);
  }

  if (input.type !== 'note.photo.save' && payload.id !== undefined && !isValidRecordId(payload.id)) {
    invalid('Choose a record.');
  }
  if (input.type.endsWith('.delete') && allowed.includes('id') && !payload.id) {
    invalid('Choose a record.');
  }
  if (REQUIRED_ID_TYPES.has(input.type) && !isValidRecordId(payload.id)) {
    invalid('Choose a record.');
  }
  return input;
}

export function parseCommand(input) {
  const keys = ['requestId', 'revision', 'type', 'payload'];
  if (!isPlainObject(input) || Object.keys(input).some(k => !keys.includes(k))) {
    invalid('Invalid diary action.');
  }
  const validId = typeof input.requestId === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(input.requestId);
  const validRev = typeof input.revision === 'string' && /^[a-f0-9]{64}$/.test(input.revision);
  if (!validId || !validRev) invalid('Refresh the diary and try again.');
  validateAction({type: input.type, payload: input.payload});
  return input;
}

const DIRECT_APPLIERS = {
  'library.edit': (state, payload, context) => applyLibraryEdit(state, payload, context),
  'food.copy': (state, payload, context) => applyFoodCopy(state, payload, context),
  'food.multi.add': (state, payload, context) => applyFoodMultiAdd(state, payload, context),
  'addMenu.save': (state, payload) => act(state, 'settings.save', {addMenu: parseAddMenu(payload.addMenu)}),
  'share.import': (state, payload) => applySharedImport(state, payload),
  'barcode.log': (state, payload, context) => applyBarcodeLog(state, payload, context),
  'text.log': (state, payload) => applyTextLog(state, payload),
  'meal.log': (state, payload) => applyMealLog(state, payload),
  'photo.log': (state, payload, context) => applyPhotoLog(state, payload, context),
};

const GROUP_PREPARERS = [
  [pauseLifeCommandFields, preparePauseLifeCommand],
  [displayCommandFields, prepareDisplayCommand],
  [diaryDisplayCommandFields, prepareDiaryDisplayCommand],
  [libraryExtrasCommandFields, prepareLibraryExtrasCommand],
  [entryAdjustmentFields, prepareEntryAdjustmentCommand],
  [foodInsightCommandFields, prepareFoodInsightCommand],
  [targetPolicyCommandFields, prepareTargetPolicyCommand],
];

const HANDLED_APPLIERS = [
  applyHealthCommand,
  applyChartDisplayCommand,
  applyCoachCommand,
  applyNotePhotoCommand,
  applyDiaryToolsCommand,
  applyDashboardCommand,
  applySnapshotCommand,
  applyFastingCommand,
  applyRecordCommand,
];

function dispatchCommand(state, input, context) {
  if (Object.hasOwn(DIRECT_APPLIERS, input.type)) {
    return DIRECT_APPLIERS[input.type](state, input.payload, context);
  }
  if (Object.hasOwn(profileSettingsCommandFields, input.type)) {
    return applyProfileSettingsCommand(state, input);
  }
  for (const [group, prepare] of GROUP_PREPARERS) {
    if (Object.hasOwn(group, input.type)) {
      const prepared = prepare(state, input, context);
      return act(state, prepared.type, prepared.payload);
    }
  }
  for (const apply of HANDLED_APPLIERS) {
    const outcome = apply(state, input, context);
    if (outcome.handled) return outcome.result;
  }
  const domainType = input.type === 'preferences.patch' ? 'settings.save' : input.type;
  return act(state, domainType, libraryPayload(state, input));
}

export function applyWorkspaceCommand(state, input, context = {}) {
  validateAction(input);
  try {
    const tracked=/^(entry\.|note\.|biometric\.|water\.add|meal\.log|photo\.log|records\.copy$)/.test(input.type);
    const before=tracked?Object.fromEntries(['entries','biometrics','notes'].map(collection=>[collection,new Set(state[collection].map(row=>row.id))])):null;
    const saved=dispatchCommand(state, input, context);
    if(!tracked)return saved;
    const records={};
    for(const collection of ['entries','biometrics','notes']){
      const added=state[collection].filter(row=>!before[collection].has(row.id));
      const updated=((input.type==='entry.update'&&collection==='entries')||(input.type==='note.photo.save'&&collection==='notes'))?state[collection].filter(row=>row.id===input.payload.id):[];
      if(added.length||updated.length)records[collection]=[...added,...updated];
    }
    return {...saved,records};
  } catch (error) {
    rethrowDomainError(error);
  }
}

function libraryPayload(state, {type, payload}) {
  return LIBRARY_SAVE_TYPES.has(type) ? prepareLibraryDraft(state, type.split('.')[0], payload) : payload;
}

function actionFoodRows({type, payload}) {
  if (type === 'library.edit') return libraryDraftRows(payload.kind, payload.draft);
  if (type === 'entry.add' || type === 'repeat.save') return [payload];
  if (type === 'photo.log' || type === 'meal.log' || type === 'text.log') return payload.rows ?? [];
  if (type === 'recipe.save') return payload.ingredients ?? [];
  if (type === 'meal.save' || type === 'entry.ingredients.adjust') return payload.items ?? [];
  return [];
}

export function catalogReferences(action) {
  if (action.type === 'food.copy') {
    return action.payload.selection.kind === 'catalog' ? [action.payload.selection.id] : [];
  }
  if (action.type === 'food.multi.add') {
    return [...new Set(foodMultiCatalogReferences(action.payload))];
  }
  const rowIds = actionFoodRows(action)
    .map(row => row.foodId)
    .filter(id => typeof id === 'string');
  return [...new Set([...rowIds, ...libraryExtrasCatalogReferences(action)])];
}

export async function readActionFoods(input, readCatalog) {
  const ids = catalogReferences(input);
  const foods = new Map();
  for (let i = 0; i < ids.length; i += 4) {
    const batch = await Promise.all(ids.slice(i, i + 4).map(async id => [id, await readCatalog(id)]));
    for (const [id, food] of batch) foods.set(id, food);
  }
  return foods;
}

export function captureActionFoods(state, input, foods) {
  if (SKIP_CAPTURE_TYPES.has(input.type)) return structuredClone(input);
  const action = structuredClone(input);
  const replacements = new Map();
  for (const id of catalogReferences(action)) {
    const food = foods.get(id);
    if (food) replacements.set(id, captureCatalogFood(state, food).id);
  }
  for (const row of actionFoodRows(action)) {
    if (replacements.has(row.foodId)) row.foodId = replacements.get(row.foodId);
  }
  if (action.type === 'favorite.set' && action.payload.kind === 'food' && replacements.has(action.payload.id)) {
    action.payload.id = replacements.get(action.payload.id);
  }
  return action;
}

export function validateLibraryPreview(input) {
  const allowedKeys = ['kind', 'draft', 'date', 'quantity', 'labelView'];
  const validKind = ['food', 'recipe', 'meal'].includes(input?.kind);
  const invalidLabelTarget = input?.labelView !== undefined && input.kind !== 'food';
  if (!isPlainObject(input) || Object.keys(input).some(k => !allowedKeys.includes(k)) || !validKind || invalidLabelTarget) {
    invalid('Choose a library item.');
  }
  if (input.labelView !== undefined && !isPlainObject(input.labelView)) {
    invalid('Choose a label view.');
  }
  return validateLibraryDraft(input.kind, input.draft, {editing: true});
}

export function previewLibrary(state, input) {
  const action = validateLibraryPreview(input);
  try {
    const {labelView, ...preview} = input;
    const result = previewLibraryDraft(state, {...preview, draft: libraryPayload(state, action)});
    return {
      ...result,
      ...(input.kind === 'recipe' ? {recipe: recipePreview(state, result.resource, input.quantity)} : {}),
      ...(labelView ? {labelView: foodEditorLabelView(result.resource, labelView)} : {}),
    };
  } catch (error) {
    rethrowDomainError(error);
  }
}
