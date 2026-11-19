import {dc} from './discover-cloud-messages.js';
import {uiLanguage, t} from './app-language.js';
import {request} from './diary-api.js';
import {escape as e} from './html.js';
import {mountNoteEditor} from './note-photos.js';
import {MobileExerciseBrowser} from './record-source/mobile-exercise-browser.js';
import {MobileExerciseEditor, mobileExerciseMarkup} from './record-source/mobile-exercise-editor.js';
import {CatalogExerciseEditor} from './record-source/catalog-exercise-editor.js';
import {MobileBiometricPanel} from './record-source/mobile-biometric.js';
import {blankBiometricDraft} from './record-source/biometric-entry.js';
import {formatMessage} from './record-source/message-format.js';
import {convertEnergy} from './dashboard-source/energy-units.mjs';

const COLLECTIONS = {exercise: 'entries', biometric: 'biometrics'};
const PANEL_CLASSES = ['mobile-food-editor', 'mobile-catalog-browser', 'mobile-exercise-editor', 'mobile-biometric'];
const ACTION_SELECTORS =
  '[data-record-close],[data-record-delete],[data-record-retry],[data-record-reload],[data-delete-cancel],[data-delete-confirm]';
const BIOMETRIC_VALUE_FIELDS = ['value', 'stonePounds', 'durationHours', 'durationMinutes', 'unit'];

const message = (key, values) => formatMessage(uiLanguage(), key, values);
const clock = () => new Date().toTimeString().slice(0, 5);

function ensureRecordStyles() {
  if (document.querySelector('link[data-record-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/records.css';
  link.dataset.recordStyle = '';
  document.head.append(link);
}

function sameSelection(a, b) {
  if (!a || !b) return false;
  const entries = Object.entries(a);
  return entries.length === Object.keys(b).length && entries.every(([key, value]) => b[key] === value);
}

function resolveDefaultGroup(options, record, value, initialGroup) {
  if (record) return record.group;
  if (value.group) return value.group;
  if (options.groups.includes(initialGroup)) return initialGroup;
  if (options.groups.includes('Uncategorized')) return 'Uncategorized';
  return options.groups[0];
}

function buildExerciseSubmitAction({activity, record, form, unit, correction}) {
  const f = form.elements;
  const common = {
    date: f.date.value,
    time: f.time.value,
    group: f.group.value,
    duration: Number(f.duration.value),
  };
  if (activity) {
    const useEstimate = f.useEstimate.value === 'true';
    return {
      type: 'exercise.catalog.add',
      payload: {
        ...common,
        code: f.code.value,
        weightKg: Number(f.weightKg.value),
        useEstimate,
        ...(useEstimate ? {} : {calories: convertEnergy(Number(f.calories.value), unit, 'kcal')}),
      },
    };
  }
  const changes = {...common, name: f.name.value, calories: convertEnergy(Number(f.calories.value), unit, 'kcal')};
  return {type: record ? 'record.correct' : 'exercise.add', payload: record ? correction(changes) : changes};
}

function decorateSavedExerciseForm(form, record) {
  const dateField = document.createElement('label');
  dateField.className = 'me-row';
  dateField.innerHTML = `<strong>${t('diaryCorrection.date')}</strong><input type="date" value="${e(record.date)}" data-record-date required>`;
  form.querySelector('.me-card').append(dateField);
  dateField.querySelector('input').oninput = event => {
    form.elements.date.value = event.target.value;
  };
  if (!record.exerciseBasis) return;
  const basis = record.exerciseBasis;
  form.insertAdjacentHTML(
    'beforeend',
    `<details class="record-source"><summary>${dc('originalEstimate')}</summary><p>${e(basis.minutes)} min · ${e(basis.weightKg)} kg · ${e(basis.estimatedKcal)} kcal</p><a href="${e(basis.source)}" target="_blank" rel="noreferrer">${e(basis.edition)}</a></details>`,
  );
}

function buildBiometricDraft({options, record, detail, date, initialSelection, initialGroup}) {
  const selected = record ? detail.biometricChoice : initialSelection;
  const metric = selected ? options.biometrics.metrics.find(row => sameSelection(row.selection, selected.selection)) : null;
  if (selected && (!metric || (selected.unit !== null && !metric.units.includes(selected.unit)))) {
    throw Error(dc('measurementUnavailable'));
  }
  const group = record ? record.group : options.groups.includes(initialGroup) ? initialGroup : null;
  const draft = blankBiometricDraft(record?.date ?? date, record?.time ?? clock(), group);
  if (!record) return {selected, metric, draft};
  if (!metric) throw Error(dc('measurementUnavailable'));

  draft.metric = metric.key;
  draft.unit = record.unit;
  draft.value = String(record.value);
  draft.name = record.type;
  if (metric.selection.kind === 'catalog' && metric.selection.id === 'weight' && record.unit === 'st') {
    draft.value = String(Math.floor(record.value));
    draft.stonePounds = String(Number(((record.value - Math.floor(record.value)) * 14).toFixed(12)));
  }
  if (metric.selection.kind === 'catalog' && metric.selection.id === 'sleep' && record.unit === 'h') {
    draft.durationHours = String(Math.floor(record.value));
    draft.durationMinutes = String(Math.round((record.value - Math.floor(record.value)) * 60));
  }
  return {selected, metric, draft};
}

function createBiometricSession({record, detail, options, draft, metric, hasEnvelope, onSave, onReconcile, correction}) {
  const listeners = new Set();
  const original = structuredClone(draft);
  return {
    language: uiLanguage(),
    editing: Boolean(record),
    draft,
    library: options.biometrics,
    pending: null,
    error: '',
    unknown: false,
    imported: false,
    readOnly: Boolean(record && !detail.editable),
    message: (key, values) => message('measurementLog.' + key, values),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    notify() {
      for (const fn of listeners) fn();
    },
    invalidate() {
      if (!hasEnvelope()) {
        this.error = '';
        this.notify();
      }
    },
    stopWaiting() {},
    load: async () => {},
    reconcile: () => onReconcile(),
    async save(input) {
      if (!record) return onSave('biometric.log', input);
      const unchanged = BIOMETRIC_VALUE_FIELDS.every(key => this.draft[key] === original[key]);
      const changes = {
        date: input.date,
        time: input.time,
        group: input.group,
        type: metric.selection.kind === 'metric' ? this.draft.name : record.type,
        unit: input.unit,
        value: unchanged ? record.value : input.values.value,
      };
      await onSave('record.correct', correction(changes));
    },
  };
}

function syncEditorControls({root, panel, session, record, detail, busy, envelope, conflict}) {
  const locked = busy || Boolean(envelope) || conflict;
  if (!locked) {
    for (const node of root.querySelectorAll('[data-record-disabled]')) {
      node.disabled = node.dataset.recordDisabled === 'true';
      delete node.dataset.recordDisabled;
    }
    if (panel instanceof CatalogExerciseEditor) panel.refresh();
    else if (panel instanceof MobileExerciseEditor) panel.update();
    else panel?.controls();
  }
  if (locked || (record && !detail.editable)) {
    for (const node of root.querySelectorAll('input,select,form button')) {
      if (!Object.hasOwn(node.dataset, 'recordDisabled')) node.dataset.recordDisabled = String(node.disabled);
      node.disabled = true;
    }
  }
  for (const button of root.querySelectorAll(ACTION_SELECTORS)) {
    button.disabled = busy || (button.hasAttribute('data-record-delete') && (Boolean(envelope) || conflict));
  }
  if (session?.unknown && !busy && !conflict) {
    const retry = root.querySelector('[data-mb-check]');
    if (retry) retry.disabled = false;
  }
  if (record && !detail.editable) root.querySelector('[type=submit]')?.setAttribute('hidden', '');
}

/** Each open sheet owns its draft, pending command and disposable source presentation. */
export async function mountRecordEditor(args) {
  const {kind, date, show, close, content, onChange, initialSelection, initialGroup} = args;
  let record = args.record;
  if (kind === 'note') return mountNoteEditor(args);
  if (!Object.hasOwn(COLLECTIONS, kind)) return;

  ensureRecordStyles();
  const initialTitle = kind === 'exercise' ? t('exerciseBrowser.root') : t('mobileBiometric.title');
  show(
    `<section class="record-surface"><header class="dialog-head"><button type="button" data-record-close aria-label="${t('common.close')}">×</button><h2>${e(initialTitle)}</h2></header><div data-record-content><p class="empty" role="status">${t('mobileNutrientDetail.loading')}</p></div><div class="record-status" role="alert"></div></section>`,
  );

  const root = content.querySelector('.record-surface');
  const sheet = content.closest('dialog');
  const abort = new AbortController();
  sheet.classList.add('record-sheet');

  let options, detail, panel, session;
  let disposed = false;
  let busy = false;
  let envelope = null;
  let conflict = false;
  let returnTo = null;
  let deletePrompt = false;

  const alive = () => !disposed && root.isConnected;
  const status = () => root.querySelector('.record-status');
  const correction = changes => ({collection: COLLECTIONS[kind], id: record.id, recordRevision: detail.recordRevision, changes});

  function teardown() {
    panel?.dispose();
    panel = null;
    session = null;
    sheet.classList.remove(...PANEL_CLASSES);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    teardown();
    abort.abort();
    observer.disconnect();
    sheet.classList.remove('record-sheet');
  }

  function exit() {
    if (busy) return;
    dispose();
    close();
  }

  function closeDeletePrompt() {
    root.querySelector('.record-delete-confirm')?.remove();
    deletePrompt = false;
  }

  function back() {
    if (busy) return;
    if (deletePrompt) return closeDeletePrompt();
    const activeMenu = panel?.menu ?? panel?.base?.menu;
    if (activeMenu) return activeMenu.close();
    if (envelope || conflict || record) return exit();
    if (kind === 'biometric' && panel?.back()) return;
    if (returnTo) {
      const next = returnTo;
      returnTo = null;
      return next();
    }
    exit();
  }

  function frame(title, html) {
    teardown();
    root.innerHTML = `<header class="dialog-head"><button type="button" data-action="close-dialog" data-record-close aria-label="${t('discover.back')}">×</button><h2>${e(title)}</h2></header><div data-record-content>${html}</div><div class="record-status" role="alert"></div>`;
    sheet.scrollTop = 0;
    return root.querySelector('[data-record-content]');
  }

  function controls() {
    if (!alive()) return;
    syncEditorControls({root, panel, session, record, detail, busy, envelope, conflict});
  }

  function errorView(error) {
    if (!alive()) return;
    const messageText = session && !conflict ? '' : e(error.message);
    const actionButton = conflict
      ? `<button type="button" data-record-reload>${dc('reloadRecord')}</button>`
      : envelope && !session
        ? `<button type="button" data-record-retry>${t('mobileSuggest.retry')}</button>`
        : '';
    status().innerHTML = messageText + actionButton;
    if (!session) return;
    session.error = error.message;
    session.unknown = Boolean(envelope) && !conflict;
    if (conflict) session.readOnly = true;
    session.notify();
  }

  async function save(type, payload) {
    if (busy || conflict || !alive()) return;
    if (!envelope) {
      envelope = {
        requestId: crypto.randomUUID(),
        revision: detail?.revision ?? options.revision,
        type,
        payload: structuredClone(payload),
      };
    }
    busy = true;
    status().textContent = '';
    if (session) {
      session.pending = 'save';
      session.error = '';
      session.notify();
    }
    controls();
    try {
      await request('/api/workspace/command', envelope);
      if (!alive()) return;
      await onChange();
      if (alive()) {
        busy = false;
        exit();
      }
    } catch (error) {
      if (!alive()) return;
      if (error.status >= 400 && error.status < 500 && error.status !== 408) {
        envelope = null;
        conflict = error.status === 409;
      }
      errorView(error);
    } finally {
      busy = false;
      if (alive()) {
        if (session) {
          session.pending = null;
          session.notify();
        }
        controls();
      }
    }
  }

  function confirmDelete() {
    if (busy || envelope || conflict || deletePrompt || !detail?.deletable) return;
    deletePrompt = true;
    root.insertAdjacentHTML(
      'beforeend',
      `<section class="record-delete-confirm" role="alertdialog" aria-label="${e(dc('deleteRecord'))}"><p>${dc('deleteRecord')}</p><div><button type="button" data-delete-cancel>${t('common.cancel')}</button><button type="button" data-delete-confirm>${t('libraryLifecycle.deleteButton')}</button></div></section>`,
    );
    root.querySelector('[data-delete-cancel]').focus();
  }

  function savedActions() {
    if (!record) return;
    if (!detail.editable) status().textContent = detail.reason;
    if (detail.deletable) {
      root.insertAdjacentHTML(
        'beforeend',
        `<button type="button" class="record-delete" data-record-delete>${t('libraryLifecycle.deleteButton')}</button>`,
      );
    }
  }

  function exerciseBrowser(snapshot = {node: 'root', query: '', parent: null}) {
    const body = frame(message('exerciseBrowser.' + snapshot.node), '');
    returnTo = snapshot.parent ? () => exerciseBrowser(snapshot.parent) : null;
    panel = new MobileExerciseBrowser({
      root: body,
      dialog: sheet,
      message: key => message('exerciseBrowser.' + key),
      api: () => request('/api/records/exercise-catalog', null, abort.signal),
      snapshot,
      onNavigate: next => exerciseBrowser(next),
      onSelect: (activity, choices, titleKey, from) => exerciseEditor({activity, choices, titleKey, from}),
      onCustom: from => exerciseEditor({from}),
    });
  }

  function exerciseEditor({activity, choices, titleKey, from, draft} = {}) {
    const value = record ?? draft ?? {};
    const unit = options.energyUnit;
    const group = resolveDefaultGroup(options, record, value, initialGroup);
    const values = {
      id: value.id,
      date: value.date ?? date,
      name: activity?.description ?? value.name ?? '',
      duration: value.duration ?? 15,
      calories: value.caloriesBurned == null ? '' : convertEnergy(value.caloriesBurned, 'kcal', unit),
      time: value.time ?? clock(),
    };
    const groupOptions = options.groups.map(g => `<option value="${e(g)}" ${g === group ? 'selected' : ''}>${e(g)}</option>`).join('');
    const markup = mobileExerciseMarkup({
      value: values,
      groupOptions,
      unit,
      limits: {...options.exerciseLimits, maximumEnergy: convertEnergy(options.exerciseLimits.maximumKcal, 'kcal', unit)},
      message,
      edit: Boolean(record),
    });
    const title = record ? dc('editExercise') : activity ? message('exerciseBrowser.' + (titleKey ?? 'root')) : t('activity.customExercise');
    frame(title, markup);
    returnTo = from ? () => exerciseBrowser(from) : null;

    panel = activity
      ? new CatalogExerciseEditor({
          dialog: sheet,
          message,
          activity,
          choices,
          titleKey,
          api: async () => options.exerciseWeight,
          onCustom: next => exerciseEditor({from, draft: next}),
        })
      : new MobileExerciseEditor({dialog: sheet, message});

    const form = root.querySelector('form');
    if (record) decorateSavedExerciseForm(form, record);
    form.addEventListener(
      'submit',
      event => {
        event.preventDefault();
        if (busy || envelope || conflict) return;
        const next = buildExerciseSubmitAction({activity, record, form, unit, correction});
        void save(next.type, next.payload);
      },
      {signal: abort.signal},
    );
    savedActions();
    controls();
  }

  function biometricEditor() {
    const body = frame(record ? dc('editBiometric') : t('mobileBiometric.title'), '');
    const {selected, metric, draft} = buildBiometricDraft({options, record, detail, date, initialSelection, initialGroup});
    session = createBiometricSession({
      record,
      detail,
      options,
      draft,
      metric,
      hasEnvelope: () => Boolean(envelope),
      onSave: save,
      onReconcile: () => save(),
      correction,
    });
    panel = new MobileBiometricPanel({
      root: body,
      session,
      date,
      time: draft.time,
      group: draft.group,
      initialEntry: record ? null : selected,
    });
    savedActions();
    controls();
  }

  const observer = new MutationObserver(() => {
    if (!root.isConnected) dispose();
  });
  observer.observe(content, {childList: true});

  const cancel = event => {
    if (!alive()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    back();
  };
  sheet.addEventListener('cancel', cancel, {capture: true, signal: abort.signal});
  window.addEventListener('nourishing-back', cancel, {capture: true, signal: abort.signal});
  sheet.addEventListener(
    'click',
    event => {
      if (event.target !== sheet) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      back();
    },
    {capture: true, signal: abort.signal},
  );

  const buttonActions = [
    ['data-record-close', () => back()],
    ['data-record-reload', () => { dispose(); void mountRecordEditor(args); }],
    ['data-record-retry', () => { void save(); }],
    ['data-record-delete', () => confirmDelete()],
    ['data-delete-cancel', () => closeDeletePrompt()],
    ['data-delete-confirm', () => { void save(kind === 'exercise' ? 'entry.delete' : 'biometric.delete', {id: record.id}); }],
  ];
  root.addEventListener(
    'click',
    event => {
      const button = event.target.closest('button');
      if (!button) return;
      for (const [attr, action] of buttonActions) {
        if (button.hasAttribute(attr)) action();
      }
    },
    {signal: abort.signal},
  );

  try {
    [options, detail] = await Promise.all([
      request('/api/records/options?' + new URLSearchParams({date: record?.date ?? date}), null, abort.signal),
      record ? request('/api/records/item?' + new URLSearchParams({collection: COLLECTIONS[kind], id: record.id}), null, abort.signal) : null,
    ]);
    if (!alive()) return;
    if (detail) record = detail.record;
    if (kind === 'exercise') {
      if (record) exerciseEditor();
      else exerciseBrowser();
    } else {
      biometricEditor();
    }
  } catch (error) {
    if (alive()) errorView(error);
  }

  return {dispose, back};
}
