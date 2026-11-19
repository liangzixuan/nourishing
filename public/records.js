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

class RecordEditorController {
  constructor(args) {
    this.args = args;
    this.kind = args.kind;
    this.date = args.date;
    this.record = args.record;
    this.options = null;
    this.detail = null;
    this.panel = null;
    this.session = null;
    this.disposed = false;
    this.busy = false;
    this.envelope = null;
    this.conflict = false;
    this.returnTo = null;
    this.deletePrompt = false;

    const initialTitle = this.kind === 'exercise' ? t('exerciseBrowser.root') : t('mobileBiometric.title');
    args.show(
      `<section class="record-surface"><header class="dialog-head"><button type="button" data-record-close aria-label="${t('common.close')}">×</button><h2>${e(initialTitle)}</h2></header><div data-record-content><p class="empty" role="status">${t('mobileNutrientDetail.loading')}</p></div><div class="record-status" role="alert"></div></section>`,
    );

    this.root = args.content.querySelector('.record-surface');
    this.sheet = args.content.closest('dialog');
    this.abort = new AbortController();
    this.sheet.classList.add('record-sheet');
    this.observer = new MutationObserver(() => {
      if (!this.root.isConnected) this.dispose();
    });
    this.observer.observe(args.content, {childList: true});
    this.bindEvents();
  }

  alive() {
    return !this.disposed && this.root.isConnected;
  }

  status() {
    return this.root.querySelector('.record-status');
  }

  correction(changes) {
    return {collection: COLLECTIONS[this.kind], id: this.record.id, recordRevision: this.detail.recordRevision, changes};
  }

  teardown() {
    this.panel?.dispose();
    this.panel = null;
    this.session = null;
    this.sheet.classList.remove(...PANEL_CLASSES);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.teardown();
    this.abort.abort();
    this.observer.disconnect();
    this.sheet.classList.remove('record-sheet');
  }

  exit() {
    if (this.busy) return;
    this.dispose();
    this.args.close();
  }

  closeDeletePrompt() {
    this.root.querySelector('.record-delete-confirm')?.remove();
    this.deletePrompt = false;
  }

  back() {
    if (this.busy) return;
    if (this.deletePrompt) return this.closeDeletePrompt();
    const activeMenu = this.panel?.menu ?? this.panel?.base?.menu;
    if (activeMenu) return activeMenu.close();
    if (this.envelope || this.conflict || this.record) return this.exit();
    if (this.kind === 'biometric' && this.panel?.back()) return;
    if (this.returnTo) {
      const next = this.returnTo;
      this.returnTo = null;
      return next();
    }
    this.exit();
  }

  frame(title, html) {
    this.teardown();
    this.root.innerHTML = `<header class="dialog-head"><button type="button" data-action="close-dialog" data-record-close aria-label="${t('discover.back')}">×</button><h2>${e(title)}</h2></header><div data-record-content>${html}</div><div class="record-status" role="alert"></div>`;
    this.sheet.scrollTop = 0;
    return this.root.querySelector('[data-record-content]');
  }

  controls() {
    if (!this.alive()) return;
    syncEditorControls(this);
  }

  errorView(error) {
    if (!this.alive()) return;
    const messageText = this.session && !this.conflict ? '' : e(error.message);
    const actionButton = this.conflict
      ? `<button type="button" data-record-reload>${dc('reloadRecord')}</button>`
      : this.envelope && !this.session
        ? `<button type="button" data-record-retry>${t('mobileSuggest.retry')}</button>`
        : '';
    this.status().innerHTML = messageText + actionButton;
    if (!this.session) return;
    this.session.error = error.message;
    this.session.unknown = Boolean(this.envelope) && !this.conflict;
    if (this.conflict) this.session.readOnly = true;
    this.session.notify();
  }

  async save(type, payload) {
    if (this.busy || this.conflict || !this.alive()) return;
    if (!this.envelope) {
      this.envelope = {
        requestId: crypto.randomUUID(),
        revision: this.detail?.revision ?? this.options.revision,
        type,
        payload: structuredClone(payload),
      };
    }
    this.busy = true;
    this.status().textContent = '';
    if (this.session) {
      this.session.pending = 'save';
      this.session.error = '';
      this.session.notify();
    }
    this.controls();
    try {
      await request('/api/workspace/command', this.envelope);
      if (!this.alive()) return;
      await this.args.onChange();
      if (this.alive()) {
        this.busy = false;
        this.exit();
      }
    } catch (error) {
      if (!this.alive()) return;
      if (error.status >= 400 && error.status < 500 && error.status !== 408) {
        this.envelope = null;
        this.conflict = error.status === 409;
      }
      this.errorView(error);
    } finally {
      this.busy = false;
      if (this.alive()) {
        if (this.session) {
          this.session.pending = null;
          this.session.notify();
        }
        this.controls();
      }
    }
  }

  confirmDelete() {
    if (this.busy || this.envelope || this.conflict || this.deletePrompt || !this.detail?.deletable) return;
    this.deletePrompt = true;
    this.root.insertAdjacentHTML(
      'beforeend',
      `<section class="record-delete-confirm" role="alertdialog" aria-label="${e(dc('deleteRecord'))}"><p>${dc('deleteRecord')}</p><div><button type="button" data-delete-cancel>${t('common.cancel')}</button><button type="button" data-delete-confirm>${t('libraryLifecycle.deleteButton')}</button></div></section>`,
    );
    this.root.querySelector('[data-delete-cancel]').focus();
  }

  savedActions() {
    if (!this.record) return;
    if (!this.detail.editable) this.status().textContent = this.detail.reason;
    if (this.detail.deletable) {
      this.root.insertAdjacentHTML(
        'beforeend',
        `<button type="button" class="record-delete" data-record-delete>${t('libraryLifecycle.deleteButton')}</button>`,
      );
    }
  }

  exerciseBrowser(snapshot = {node: 'root', query: '', parent: null}) {
    const body = this.frame(message('exerciseBrowser.' + snapshot.node), '');
    this.returnTo = snapshot.parent ? () => this.exerciseBrowser(snapshot.parent) : null;
    this.panel = new MobileExerciseBrowser({
      root: body,
      dialog: this.sheet,
      message: key => message('exerciseBrowser.' + key),
      api: () => request('/api/records/exercise-catalog', null, this.abort.signal),
      snapshot,
      onNavigate: next => this.exerciseBrowser(next),
      onSelect: (activity, choices, titleKey, from) => this.exerciseEditor({activity, choices, titleKey, from}),
      onCustom: from => this.exerciseEditor({from}),
    });
  }

  exerciseEditor({activity, choices, titleKey, from, draft} = {}) {
    const value = this.record ?? draft ?? {};
    const unit = this.options.energyUnit;
    const group = resolveDefaultGroup(this.options, this.record, value, this.args.initialGroup);
    const values = {
      id: value.id,
      date: value.date ?? this.date,
      name: activity?.description ?? value.name ?? '',
      duration: value.duration ?? 15,
      calories: value.caloriesBurned == null ? '' : convertEnergy(value.caloriesBurned, 'kcal', unit),
      time: value.time ?? clock(),
    };
    const groupOptions = this.options.groups
      .map(g => `<option value="${e(g)}" ${g === group ? 'selected' : ''}>${e(g)}</option>`)
      .join('');
    const markup = mobileExerciseMarkup({
      value: values,
      groupOptions,
      unit,
      limits: {...this.options.exerciseLimits, maximumEnergy: convertEnergy(this.options.exerciseLimits.maximumKcal, 'kcal', unit)},
      message,
      edit: Boolean(this.record),
    });
    const title = this.record
      ? dc('editExercise')
      : activity
        ? message('exerciseBrowser.' + (titleKey ?? 'root'))
        : t('activity.customExercise');
    this.frame(title, markup);
    this.returnTo = from ? () => this.exerciseBrowser(from) : null;

    this.panel = activity
      ? new CatalogExerciseEditor({
          dialog: this.sheet,
          message,
          activity,
          choices,
          titleKey,
          api: async () => this.options.exerciseWeight,
          onCustom: next => this.exerciseEditor({from, draft: next}),
        })
      : new MobileExerciseEditor({dialog: this.sheet, message});

    const form = this.root.querySelector('form');
    if (this.record) decorateSavedExerciseForm(form, this.record);
    form.addEventListener(
      'submit',
      event => {
        event.preventDefault();
        if (this.busy || this.envelope || this.conflict) return;
        const next = buildExerciseSubmitAction({
          activity,
          record: this.record,
          form,
          unit,
          correction: changes => this.correction(changes),
        });
        void this.save(next.type, next.payload);
      },
      {signal: this.abort.signal},
    );
    this.savedActions();
    this.controls();
  }

  biometricEditor() {
    const body = this.frame(this.record ? dc('editBiometric') : t('mobileBiometric.title'), '');
    const {selected, metric, draft} = buildBiometricDraft({
      options: this.options,
      record: this.record,
      detail: this.detail,
      date: this.date,
      initialSelection: this.args.initialSelection,
      initialGroup: this.args.initialGroup,
    });
    this.session = createBiometricSession({
      record: this.record,
      detail: this.detail,
      options: this.options,
      draft,
      metric,
      hasEnvelope: () => Boolean(this.envelope),
      onSave: (type, payload) => this.save(type, payload),
      onReconcile: () => this.save(),
      correction: changes => this.correction(changes),
    });
    this.panel = new MobileBiometricPanel({
      root: body,
      session: this.session,
      date: this.date,
      time: draft.time,
      group: draft.group,
      initialEntry: this.record ? null : selected,
    });
    this.savedActions();
    this.controls();
  }

  bindEvents() {
    const cancel = event => {
      if (!this.alive()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.back();
    };
    this.sheet.addEventListener('cancel', cancel, {capture: true, signal: this.abort.signal});
    window.addEventListener('nourishing-back', cancel, {capture: true, signal: this.abort.signal});
    this.sheet.addEventListener(
      'click',
      event => {
        if (event.target !== this.sheet) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.back();
      },
      {capture: true, signal: this.abort.signal},
    );

    const buttonActions = [
      ['data-record-close', () => this.back()],
      ['data-record-reload', () => { this.dispose(); void mountRecordEditor(this.args); }],
      ['data-record-retry', () => { void this.save(); }],
      ['data-record-delete', () => this.confirmDelete()],
      ['data-delete-cancel', () => this.closeDeletePrompt()],
      ['data-delete-confirm', () => { void this.save(this.kind === 'exercise' ? 'entry.delete' : 'biometric.delete', {id: this.record.id}); }],
    ];
    this.root.addEventListener(
      'click',
      event => {
        const button = event.target.closest('button');
        if (!button) return;
        for (const [attr, action] of buttonActions) {
          if (button.hasAttribute(attr)) action();
        }
      },
      {signal: this.abort.signal},
    );
  }

  async load() {
    try {
      [this.options, this.detail] = await Promise.all([
        request('/api/records/options?' + new URLSearchParams({date: this.record?.date ?? this.date}), null, this.abort.signal),
        this.record
          ? request('/api/records/item?' + new URLSearchParams({collection: COLLECTIONS[this.kind], id: this.record.id}), null, this.abort.signal)
          : null,
      ]);
      if (!this.alive()) return;
      if (this.detail) this.record = this.detail.record;
      if (this.kind === 'exercise') {
        if (this.record) this.exerciseEditor();
        else this.exerciseBrowser();
      } else {
        this.biometricEditor();
      }
    } catch (error) {
      if (this.alive()) this.errorView(error);
    }
  }
}

/** Each open sheet owns its draft, pending command and disposable source presentation. */
export async function mountRecordEditor(args) {
  if (args.kind === 'note') return mountNoteEditor(args);
  if (!Object.hasOwn(COLLECTIONS, args.kind)) return;
  ensureRecordStyles();
  const controller = new RecordEditorController(args);
  await controller.load();
  return {dispose: () => controller.dispose(), back: () => controller.back()};
}
