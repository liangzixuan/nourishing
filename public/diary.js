import {readDeviceCache} from './device-cache.js';
import './client-errors.js';
import './pwa.js';
import {startBackgroundWrites,onBackgroundWriteStatus} from './background-writes.js';
import {localLibraryItem, localDiaryView} from './local-engine.js';
import {walkingEfforts,priorWalkingEfforts} from './local-diary-projection.js';
import {pushBackHandler} from './back-history.js';
import {startDeviceSync, warmDeviceViews} from './device-sync.js';
import {startPrivateImages} from './private-images.js';
import {sameDiarySnapshot, presentDiarySnapshot} from './diary-snapshot.js';
import {uiLanguage, applyAppLanguage, t} from './app-language.js';
import {coreText} from './core-cloud-messages.js';
import {applyFontPreferences} from './font-presentation.js';
import {MobileDiaryCalendar} from './snapshot-source/mobile-diary-calendar.js';
import {diaryEntryAmount, diaryGroupSubtotal} from './diary-table-presentation.js';
import {mountTargetsSheet} from './targets.js';
import {mountFoodCopy} from './food-copy.js';
import {mountFoodEntry} from './food-entry.js';
import {AddMenu} from './add-menu-source/add-menu.js';
import {createAppShell} from './app-shell.js';
import {mountMore} from './more.js';
import {diarySummaryMarkup, mountDiarySummary} from './diary-summary.js';
import {openDiarySummaryAction} from './diary-summary-actions.js';
import {diaryCycleMarkup} from './diary-cycle.js';
import {openDiarySession} from './diary-startup.js';
import {mountTextLog} from './text-log.js';
import {notePhotoThumbnail} from './note-photos.js';
import {createDiaryTools} from './diary-tools.js';
import {bindDiaryRowSwipe} from './diary-row-swipe.js';
import {openNutrientDetail} from './nutrient-detail.js';
import {openBarcode} from './barcode.js';
import {openEntryAdjustment} from './entry-adjustments.js';
import {openMealNutrition,openSelectionNutrition} from './meal-nutrition.js';
import {openDiaryShare} from './diary-sharing.js';
import {openFoodInsights} from './food-insights.js';
import {mountPhotoLog} from './photo-log.js';
import {mountRecordEditor} from './records.js';
import {mountRepeats} from './repeats.js';
import {mobileDiaryHeader, mobileDiaryGroups, mobileDiaryRecord, diarySymbol} from './diary-view.js';
import {escape as e} from './html.js';
import {request, readDiaryCalendarMonth, command, clearPending, queueCommand, queuePhoto} from './diary-api.js';
import {mountLibrary} from './library.js';
import {mountFoodPicker} from './food-picker.js';
import {openFastingAction} from './fasting.js';
import {mountNutrition} from './nutrition.js';
import {applyTheme} from './appearance.js';
import {dismissWaterHint,waterPolicy,waterRecordAmount,newestWaterEntry,openWaterAmount,openWaterMenu,mountWaterSettings} from './water.js';
import {waterText} from './water-messages.js';
import {moreBackHeader} from './more-source/menu-view.js';

const page = document.querySelector('#page');
const dateBar = document.querySelector('#diary-date');
const sheet = document.querySelector('#sheet');
const content = document.querySelector('#sheet-content');
const notice = document.querySelector('#notice');
const headerRoot = document.querySelector('.app-header');
const shell = createAppShell({headerRoot, dateBar, navigation: document.querySelector('.app-nav')});

onBackgroundWriteStatus(event => {
  if(event.saved||event.discarded)void load({reuseUnchanged:true});
});

const svg = path =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

const icons = {
  check: svg('<path d="m5 12 4 4L19 6"/>'),
  back: svg('<path d="m15 5-7 7 7 7"/>'),
  chevron: svg('<path d="m9 5 7 7-7 7"/>'),
  more: svg('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  close: svg('<path d="m6 6 12 12M18 6 6 18"/>'),
  food: svg('<path d="M5 3v7m4-7v7m-4-4h4M7 10v11M18 3v18m0-18c-4 3-4 9 0 9"/>'),
};

const TAB_ROUTES = {
  'discover-tab': 'discover',
  'settings-tab': 'more',
  'foods-tab': 'foods',
  'diary-tab': 'diary',
};

const SELECTION_KIND_MAP = {catalog: 'food', foods: 'food', recipes: 'recipe', meals: 'meal'};

const formatDate = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => formatDate(new Date());
const num = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString(uiLanguage(), {maximumFractionDigits: d}) : '—');
const defaultGroup = groups => (groups?.includes('Uncategorized') ? 'Uncategorized' : groups?.[0]);

let addMenu = null;
let diaryCalendar = null;
let view = 'diary';
let library = null;
let nutrition = null;
let more = null;
let summaryPanel = null;
let disposeRowSwipe = null;
let waterPanel=null,waterMenu=null,waterAmount=null;
let pickerCleanup;
let account;
let accountReady = false;
let pendingDiaryAction = null;
let diaryReceivedAt = 0;
let date = today();
let diary = null;
let loadId = 0;
let searchId = 0;
let group = 'Uncategorized';
let selectedDiaryGroup = null;
let sheetBackHandle = null;
let tabBackHandle = null;
let repeatsBackHandle = null;

function handleSheetBack() {
  if (!sheet.open) return;
  const event = new CustomEvent('nourishing-back', {cancelable: true});
  window.dispatchEvent(event);
  if (event.defaultPrevented) return sheet.open ? 'keep' : undefined;
  if (pickerCleanup?.back?.()) return 'keep';
  sheetBackHandle = null;
  close({popHistory: false});
}

function show(html) {
  pickerCleanup?.();
  pickerCleanup = null;
  searchId++;
  content.innerHTML = html;
  if (!sheet.open) {
    sheet.showModal();
    if (!sheetBackHandle) sheetBackHandle = pushBackHandler(handleSheetBack);
  }
  sheet.scrollTop = 0;
}

function close({popHistory = true} = {}) {
  pickerCleanup?.();
  pickerCleanup = null;
  searchId++;
  if (sheetBackHandle) {
    const handle = sheetBackHandle;
    sheetBackHandle = null;
    handle.release({popHistory});
  }
  sheet.close();
  content.replaceChildren();
}

const header = title =>
  `<header class="sheet-header"><button type="button" class="icon-button" data-close aria-label="${e(t('mobileNutrientDetail.close'))}">${icons.close}</button><h2 id="sheet-title">${e(title)}</h2></header>`;

const diaryTools = createDiaryTools({
  diary: () => diary,
  date: () => date,
  show,
  close,
  header,
  content,
  render,
  onChange: load,
  onComplete: toggleCompleteDay,
  onReport: () => navigate('discover','report',date),
  onShare: () => {const share=openDiaryShare(diary,{show,header,content});pickerCleanup=Object.assign(share.dispose,{back:share.back});},
  onMealAction: mealAction,
  openEntry: (kind,id)=>edit({kind,id}),
  onNutrition: selection => openSelectionNutrition({selection,energyUnit:diary.energyUnit,show,header,content}),
});

sheet.addEventListener('click', event => {
  if (event.target === sheet) {
    const r = sheet.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
  }
  if (event.target.closest('[data-close]')) close();
});

sheet.addEventListener('cancel', event => {
  if (event.target !== sheet) return;
  event.preventDefault();
  if (!pickerCleanup?.back?.()) close();
});

async function load({reuseUnchanged = false} = {}) {
  const id = ++loadId;
  notice.textContent = '';
  page.setAttribute('aria-busy', 'true');
  try {
    if (!accountReady) {
      account = await openDiarySession({
        onAccount: value => {
          account = value;
          more?.setIdentity(value.name);
        },
      });
      accountReady = true;
      startDeviceSync(account.id);
      startBackgroundWrites();
      startPrivateImages();
    }
    const result = await request('/api/diary?date=' + date, undefined, undefined, {
      onRefresh: next => {
        if (id !== loadId || document.querySelector('dialog[open]')) return;
        applyDiary(next);
      },
    });
    if (id !== loadId) return;
    // Revalidate the current in-memory snapshot without replacing live controls.
    // A pending editor keeps its captured revision; its save still uses the server guard.
    if (reuseUnchanged && (sameDiarySnapshot(diary, result) || document.querySelector('dialog[open]'))) return;
    applyDiary(result);
  } catch (error) {
    // The response cache may have been invalidated by a completed save. The
    // retained account snapshot still owns the diary, including pending edits.
    const retained=id===loadId?await localDiaryView(date,diary??{}):null;
    if(id===loadId&&retained){applyDiary(retained);return;}
    if (id === loadId) {
      notice.textContent = error.message;
      if (view === 'diary' && !reuseUnchanged) {
        page.innerHTML = `<p class="empty"><button type="button" data-reload>${e(coreText('retry'))}</button></p>`;
      }
    }
  } finally {
    if (id === loadId) page.setAttribute('aria-busy', 'false');
  }
}

function applyDiary(result) {
  warmDeviceViews(date);
  diary = result;
  diaryReceivedAt = performance.now() - Math.max(0, Date.now() - (Date.parse(result.presentation?.fasting?.asOf) || Date.now()));
  const nextLanguage = result.presentation?.settings?.appLanguage ?? 'en';
  const languageChanged = uiLanguage() !== nextLanguage;
  applyAppLanguage(nextLanguage);
  shell.refreshLanguage();
  if (languageChanged) more?.refreshLanguage();
  applyTheme(result.theme);
  applyFontPreferences(result.presentation?.settings);
  if (view === 'diary') render();
  if (pendingDiaryAction) {
    const pending = pendingDiaryAction;
    pendingDiaryAction = null;
    pending();
  }
}

function selectTab(id) {
  shell.select(id);
}

let diaryFastingAction;
function leaveView() {
  diaryFastingAction?.dispose();diaryFastingAction=null;
  waterPanel?.dispose();waterPanel=null;waterMenu?.close(false);waterMenu=null;waterAmount?.close();waterAmount=null;
  diaryCalendar?.close();
  diaryTools.reset();
  if (repeatsBackHandle) {
    repeatsBackHandle.release({popHistory: false});
    repeatsBackHandle = null;
  }
  summaryPanel?.dispose();
  summaryPanel = null;
  disposeRowSwipe?.();disposeRowSwipe=null;
  library?.dispose();
  library = null;
  nutrition?.dispose();
  nutrition = null;
  more?.dispose();
  more = null;
  headerRoot.replaceChildren();
}

function formatEntryMeta(row, time, walkingEffort) {
  let detail;
  if (walkingEffort) {
    const duration=row.duration.toLocaleString(uiLanguage(),{minimumFractionDigits:1,maximumFractionDigits:2});
    detail=`${duration} min - ${t('exerciseBrowser.'+walkingEffort)}`;
  } else if (row.kind === 'exercise') {
    detail = `${num(row.duration)} min`;
  } else if (row.quantity !== undefined) {
    const unitLabel = row.unit === 'portion' ? row.facts?.portionLabel ?? coreText('diary.portions') : row.unit;
    detail = `${num(row.quantity)} ${unitLabel}`;
  } else {
    detail = coreText('diary.servings', {amount: num(row.amount)});
  }
  return e([time, detail].filter(Boolean).join(' · '));
}

function renderDiaryRow(collection, row) {
  const swipeOptions={swipe:!diaryTools.selection(),canDelete:!diary.completed,labels:{actions:coreText('diary.actions'),remove:t('mobileRepeat.delete')}};
  const time = diary.presentation?.settings?.showTimestamp === false ? '' : row.time;
  if (collection === 'entries') {
    const iconName = row.kind === 'exercise' ? 'fitness_center' : row.recipeId || row.mealId ? 'restaurant' : 'nutrition';
    // Older catalog records do not identify whether the user chose a preset or a specific pace.
    const selection=row.exerciseSelection;
    const walkingEffort=row.kind==='exercise'&&selection?.generalWalking&&row.name===selection.description&&(walkingEfforts[selection.code]??priorWalkingEfforts[selection.code]);
    return mobileDiaryRecord({
      ...swipeOptions,
      id: row.id,
      collection,
      name: walkingEffort?t('exerciseBrowser.generalWalking'):row.facts?.name ?? row.name,
      meta: formatEntryMeta(row, time, walkingEffort),
      amount: diaryEntryAmount(row, diary.summary.diaryTable, {energyUnit: diary.energyUnit, language: uiLanguage(),exerciseFractionDigits:walkingEffort?1:2}),
      icon: diarySymbol(iconName),
      selectBox: diaryTools.selectBox(collection, row),
      action: 'edit-entry',
    });
  }
  const isNote = collection === 'notes';
  const waterAmount=isNote?null:waterRecordAmount(diary,row);
  const waterTime=waterAmount&&time?new Date(`2000-01-01T${time}Z`).toLocaleTimeString(uiLanguage(),{hour:'numeric',minute:'2-digit',timeZone:'UTC'}).toLocaleLowerCase(uiLanguage()):'';
  const thumb = isNote ? notePhotoThumbnail(row) : '';
  return mobileDiaryRecord({
    ...swipeOptions,
    id: row.id,
    collection,
    name: isNote ? row.text : waterAmount?waterText('water'):row.type,
    meta: waterAmount?`${waterTime?`<span class="water-time" aria-hidden="true"></span>${e(waterTime)} - `:''}${e(waterAmount)}`:e(time),
    amount: isNote ? '' : waterAmount?`<span class="water-row-energy">${(0).toLocaleString(uiLanguage(),{minimumFractionDigits:1})}<small>${e(diary.energyUnit??'kcal')}</small></span>`:`${num(row.value, 20)} ${e(row.unit)}`,
    icon: waterAmount?'<img class="water-row-icon" src="/record-source/biometric-icons/water.svg" alt="">':diarySymbol(isNote ? 'description' : 'monitor_heart'),
    selectBox: diaryTools.selectBox(collection, row),
    action: isNote ? 'edit-note' : 'edit-biometric',
    extra: thumb
      ? `<button type="button" class="icon-button" data-action="edit-note" aria-label="${e(coreText('diary.notePhoto'))}">${thumb}</button>`
      : '',
  });
}

function render() {
  disposeRowSwipe?.();disposeRowSwipe=null;
  const displayedDiary = presentDiarySnapshot(diary, performance.now() - diaryReceivedAt);
  summaryPanel?.dispose();
  selectTab('diary-tab');
  dateBar.dataset.date = date;
  dateBar.hidden = false;
  document.querySelector('#diary-tab').setAttribute('aria-current', 'page');
  document.querySelector('#foods-tab').removeAttribute('aria-current');

  dateBar.innerHTML = diaryTools.selectionHeader(icons) || mobileDiaryHeader({
    date,
    today: today(),
    complete: diary.completed,
    icons,
    menu: `<button type="button" data-diary-menu class="icon-button" aria-label="${e(coreText('diary.actions'))}">${icons.more}</button>`,
    labels: {
      today: t('discover.range.today'),
      complete: coreText('diary.complete'),
      reopen: t('diary.reopen'),
      previous: t('diary.previous'),
      next: t('diary.next'),
      date: t('diary.date'),
    },
    language: uiLanguage(),
  });

  const display = diary.recordDisplay;
  const maps = Object.fromEntries(['entries', 'notes', 'biometrics'].map(col => [col, new Map(diary[col].map(row => [row.id, row]))]));
  const records = display.groups
    .flatMap(g => g.records.map(ref => ({...ref, group: g.name, row: maps[ref.collection].get(ref.id)})))
    .filter(item => item.row);
  const groupMarkup = mobileDiaryGroups({
    selectedGroup: diary.groups.includes(selectedDiaryGroup) ? selectedDiaryGroup : null,
    groups: display.groups.map(g => g.name),
    configuredGroups: diary.groups,
    records,
    renderRow: ({collection, row}) => renderDiaryRow(collection, row),
    showGroups: display.showGroups,
    selectBox: g => diaryTools.groupBox(g),
    subtotal: g =>
      diaryGroupSubtotal(diary.summary.diaryTable, g, {energyUnit: diary.energyUnit, language: uiLanguage()}) +
      `<button type="button" class="diary-group-tools" data-tool-group="${e(g)}" aria-label="${e(coreText('diary.groupActions', {group: g}))}">⋯</button>`,
    icons,
    labels: {add: t('diary.addFood'),toggle:coreText('diary.toggleGroup')},
  });

  page.innerHTML = `${diaryCycleMarkup(diary.cycleDays)}${diarySummaryMarkup(displayedDiary, diaryTools.selection(), account?.id)}<div class="md-diary diary-layout">${groupMarkup}</div>`;
  disposeRowSwipe=bindDiaryRowSwipe(page);
  summaryPanel = mountDiarySummary({
    root: page,
    diary: displayedDiary,
    onAction: summaryAction,
    onGroupSelect: value => { selectedDiaryGroup = value; },
    selection: diaryTools.selection(),
  });
}

function runAddAction(kind, initialGroup) {
  group = initialGroup ?? (view==='diary'&&diary.groups.includes(selectedDiaryGroup)?selectedDiaryGroup:defaultGroup(diary.groups));
  initialGroup = group;
  const actions = {
    food: search,
    photo: () => photoLog(initialGroup),
    voice: () => textLog(initialGroup),
    barcode: () => barcode(),
    all: () => openAddMenu(initialGroup),
    suggest: () => openInsights(),
    fast: () => {diaryFastingAction?.dispose();diaryFastingAction=openFastingAction({page,initialAction:'new',onChange:()=>load({reuseUnchanged:true})});},
    biometric: () => recordEditor('biometric', undefined, initialGroup),
    note: () => recordEditor('note', undefined, initialGroup),
    exercise: () => recordEditor('exercise', undefined, initialGroup),
  };
  return actions[kind]();
}

function openAddMenu(initialGroup) {
  if (!diary) {
    pendingDiaryAction = () => openAddMenu(initialGroup);
    return;
  }
  close();
  addMenu?.dispose();
  addMenu = new AddMenu({
    preferences: diary.presentation?.settings?.addMenu,
    onSave: async value => {
      await command(diary.revision, 'addMenu.save', {addMenu: value});
      await load();
    },
    onSelect: kind => runAddAction(kind, initialGroup),
  });
}

function openInsights(mode = 'suggestions', day = date) {
  return openFoodInsights({
    mode,
    date: () => day,
    show,
    close,
    header,
    content,
    onAdd: (_kind, id, quantity) => edit({id, kind: 'food', quantity}),
    onAdded: load,
    onPreferences: load,
  });
}

async function switchDiaryDate(nextDate) {
  diaryTools.reset();
  date = nextDate;
  if (diary && view === 'diary') {
    const local = await localDiaryView(nextDate, diary);
    if (local && date === nextDate && view === 'diary') {
      diary = local;
      render();
    }
  }
  return load({reuseUnchanged: true});
}

function openDiaryCalendar() {
  diaryCalendar?.close();
  diaryCalendar = new MobileDiaryCalendar({
    date,
    language: uiLanguage(),
    loadMonth: readDiaryCalendarMonth,
    onChoose: value => {
      void switchDiaryDate(value);
    },
    onClose: () => {
      diaryCalendar = null;
    },
  });
}

function shiftDiaryDate(delta) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return switchDiaryDate(formatDate(d));
}

async function toggleCompleteDay() {
  if (!diary) return;
  const targetDate = date;
  const nextCompleted = !diary.completed;
  await queueCommand(diary.revision,'day.complete',{date:targetDate,completed:nextCompleted});
  diary = {...diary, completed: nextCompleted};
  if (view === 'diary') render();

}

function handleRecordRowClick(target) {
  const ref = target.closest('[data-diary-record]');
  if (!ref) return;
  const collection = ref.dataset.collection;
  const id = ref.dataset.id;
  const row = diary[collection]?.find(item => item.id === id);
  if (!row) return;
  const open = () => {
    if (collection === 'notes') return recordEditor('note', row);
    if (collection === 'biometrics') return recordEditor('biometric', row);
    return row.kind === 'exercise' ? recordEditor('exercise', row) : edit({entry: row});
  };
  return (target.hasAttribute('data-md-context')||target.hasAttribute('data-md-swipe-options')) ? diaryTools.recordMenu(collection, id, open) : open();
}

async function mealAction(action,entry){
  if(action==='repeat'){
    close({popHistory:false});openRepeatsView({mealId:entry.mealId,amount:entry.amount??1,quantity:entry.quantity,unit:entry.unit,group:entry.group,time:entry.time,startDate:entry.date});return;
  }
  if(action==='original'||action==='copy-edit'){
    navigate('foods');await library?.openItem('meal',entry.mealId,undefined,{copy:action==='copy-edit'});return;
  }
  if(action==='adjust')return openEntryAdjustment({kind:'meal',revision:diary.revision,date:entry.date,id:entry.id,show,close,header,content,onSave:load});
  if(action==='nutrition')return openMealNutrition({entry,energyUnit:diary.energyUnit,show,header,content});
}

function openRepeatsView(initialDraft) {
  leaveView();
  view = 'repeats';
  selectTab('foods-tab');
  repeatsBackHandle = pushBackHandler(() => {
    if (view !== 'repeats') return;
    repeatsBackHandle = null;
    navigate('foods');
  });
  library = mountRepeats({
    initialDraft,
    page,
    headerRoot,
    onExit: () => {
      if (repeatsBackHandle) {
        const handle = repeatsBackHandle;
        repeatsBackHandle = null;
        handle.release();
      }
      navigate('foods');
    },
    show,
    close,
    header,
    content,
    date: () => date,
    onChange: load,
  });
}

function handleDocumentClick(event) {
  const target = event.target.closest('button');
  if (!target) return;
  const action = target.dataset.action;

  if (target.hasAttribute('data-md-calendar')) return openDiaryCalendar();
  if (target.hasAttribute('data-diary-menu')) return diaryTools.menu();
  if (target.dataset.toolGroup) {
    event.preventDefault();
    return diaryTools.groupMenu(target.dataset.toolGroup);
  }
  if (target.dataset.diaryTool && target.closest('.diary-selection-header')) return diaryTools.action(target.dataset.diaryTool);
  if (target.dataset.diaryNutrient) {
    return openNutrientDetail({
      nutrient: target.dataset.diaryNutrient,
      date,
      entryIds: null,
      show,
      header,
      content,
      onSource: source => {
        const entry = diary.entries.find(row => row.id === source.id);
        if (entry) edit({entry});
      },
    });
  }
  if (target.hasAttribute('data-reload')) return load();
  if (target.hasAttribute('data-note')) return recordEditor('note');
  if (target.dataset.recordId) {
    const kind = target.dataset.recordKind;
    return recordEditor(kind, diary[kind === 'note' ? 'notes' : 'biometrics'].find(r => r.id === target.dataset.recordId));
  }
  if (target.id === 'add-food') return openAddMenu();
  if (action === 'prev-day' || action === 'next-day') return shiftDiaryDate(action === 'prev-day' ? -1 : 1);
  if (action === 'complete-day') return toggleCompleteDay(target);
  if (action === 'add-food' || action === 'group-quick-add') {
    group = target.dataset.group ?? defaultGroup(diary?.groups);
    return runAddAction(action === 'group-quick-add' ? diary.presentation.groupQuickAdd[group] ?? 'food' : 'food', group);
  }
  if(target.hasAttribute('data-md-delete')){
    const row=target.closest('[data-diary-record]');
    if(row&&!diary.completed)return diaryTools.removeRecord(row.dataset.collection,row.dataset.id);
  }
  if (['edit-entry', 'edit-note', 'edit-biometric'].includes(action) || target.hasAttribute('data-md-context') || target.hasAttribute('data-md-swipe-options')) {
    return handleRecordRowClick(target);
  }
  if (Object.hasOwn(TAB_ROUTES, target.id)) return navigate(TAB_ROUTES[target.id]);
  if (target.dataset.foodInsight) return openInsights(target.dataset.foodInsight);
  if (target.hasAttribute('data-library-repeats')) return openRepeatsView();
}

document.addEventListener('change', event => {
  diaryTools.change(event);
});
document.addEventListener('click', handleDocumentClick);
document.addEventListener('click', event => {
  if (diaryTools.toggleRow(event.target)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

function navigate(next, initialTab = 'dashboard', reportDate) {
  if (!diary) {
    pendingDiaryAction = () => navigate(next, initialTab, reportDate);
    return;
  }
  leaveView();
  view = next;
  window.scrollTo(0, 0);
  const common = {
    page,
    headerRoot,
    date: () => date,
    show,
    close,
    header,
    content,
    onChange: load,
    onDiary: nextDate => {
      date = nextDate;
      return navigate('diary');
    },
  };
  if (next === 'diary') {
    if (tabBackHandle) {
      tabBackHandle.release({popHistory: false});
      tabBackHandle = null;
    }
    selectTab('diary-tab');
    const reuseUnchanged = diary?.date === date;
    if (reuseUnchanged) render();
    return load({reuseUnchanged});
  }
  if (!tabBackHandle) {
    tabBackHandle = pushBackHandler(() => {
      if (view === 'diary') return;
      tabBackHandle = null;
      navigate('diary');
    });
  }
  if(next==='water'){
    selectTab('diary-tab');dateBar.hidden=true;headerRoot.hidden=false;
    headerRoot.innerHTML=moreBackHeader(waterText('settings'));
    waterPanel=mountWaterSettings({root:page,settings:diary.presentation.settings,groups:diary.groups,onSave:async patch=>{await queueCommand(diary.revision,'display.save',patch);await load({reuseUnchanged:true});}});
    headerRoot.querySelector('[data-more-back]').onclick=()=>{if(!waterPanel?.back())navigate('diary');};
    return;
  }
  if (next === 'foods') {
    selectTab('foods-tab');
    library = mountLibrary({...common, openEntry: (kind, id) => edit({id, kind})});
    return;
  }
  if (next === 'more') {
    selectTab('settings-tab');
    more = mountMore({
      ...common,
      identity: account?.name,
      onAccount: value => {
        account = {...account, ...value};
      },
      onFoods: () => navigate('foods'),
      onDiscover: tab => navigate('discover', tab),
    });
    return;
  }
  selectTab('discover-tab');
  nutrition = mountNutrition({
    ...common,
    mode: 'discover',
    initialTab,
    reportDate,
    onSuggest: day => {
      date = day;
      return openInsights('suggestions', day);
    },
  });
}

function sourceTargets() {
  pickerCleanup = mountTargetsSheet({date: () => date, show, close, header, content, onChange: load});
}

function openCustomWaterSheet() {
  waterAmount?.close();waterAmount=openWaterAmount({policy:waterPolicy(diary),onAdd:amount=>SUMMARY_ACTIONS.water({amount,refresh:false}),onAdded:()=>load({reuseUnchanged:true})});
}

const SUMMARY_ACTIONS = {
  'open-fasting': () => navigate('discover', 'fasting'),
  'edit-day-targets': () => {
    pickerCleanup = mountTargetsSheet({date: () => date, show, close, header, content, onChange: load, initialScreen: 'day'});
  },
  'all-nutrients': () => navigate('discover', 'report', date),
  water: async input => {
    const targetDate = date;
    const entryTime = new Date().toTimeString().slice(0, 5);
    const policy=waterPolicy(diary);
    await queueCommand(diary.revision,'water.add',{date:targetDate,time:entryTime,group:policy.group??(diary.groups.includes(selectedDiaryGroup)?selectedDiaryGroup:defaultGroup(diary.groups)),amount:input.amount??policy.containerMl});
    if(input.refresh!==false)await load({reuseUnchanged:true});
  },
  'water-custom': openCustomWaterSheet,
  'water-hint-close':({anchor})=>dismissWaterHint(anchor,account?.id),
  'water-menu':input=>{waterMenu?.close(false);waterMenu=openWaterMenu(input.anchor,action=>void summaryAction({action}),{completed:diary.completed});},
  'water-settings':()=>navigate('water'),
  'water-remove':async input=>{const row=newestWaterEntry(diary);if(!row||row.id!==input.id)return;await queueCommand(diary.revision,'biometric.delete',{id:row.id});await load({reuseUnchanged:true});},
  'water-target':()=>{pickerCleanup=mountTargetsSheet({date:()=>date,show,close,header,content,onChange:load,initialScreen:'nutrients',initialNutrient:'water'});},
  'nutrient-contributors': input =>
    openNutrientDetail({
      nutrient: input.id,
      date,
      entryIds: summaryPanel?.context()?.entryIds ?? null,
      show,
      header,
      content,
    }),
};

async function summaryAction(input) {
  if (Object.hasOwn(SUMMARY_ACTIONS, input.action)) {
    return SUMMARY_ACTIONS[input.action](input);
  }
  const summaryDiary =
    input.action === 'mobile-diary-energy'
      ? {...diary, summary: summaryPanel?.context()?.chartSummary ?? diary.summary}
      : diary;
  const cleanup = openDiarySummaryAction({
    ...input,
    diary: summaryDiary,
    date,
    show,
    close,
    header,
    content,
    onChange: load,
    onTargets: sourceTargets,
    onReport: day => navigate('discover', 'report', day),
  });
  if (typeof cleanup === 'function') pickerCleanup = cleanup;
}

async function search(restore = null, {applied, selected} = {}) {
  if (!diary) return;
  if (!diary.groups.includes(group)) group = defaultGroup(diary.groups);
  show(`${header(t('diary.addFood'))}<div class="diary-picker"></div>`);
  const ownerTicket=readDeviceCache('/api/diary').then(result=>result.ticket);
  const currentTicket=async()=>{
    const [opened,{ticket:active}]=await Promise.all([ownerTicket,readDeviceCache('/api/diary')]);
    if(!opened||opened.ownerId!==account.id||active?.ownerId!==opened.ownerId||active.epoch!==opened.epoch)throw Error(coreText('request.unavailable'));
    return opened;
  };
  const picker = mountFoodPicker(content.querySelector('.diary-picker'), {
    onPick: (kind, id) => {
      const snapshot = picker.snapshot();
      return edit({id, kind, returnSearch: () => search(snapshot)});
    },
    onBarcode: () => searchBarcode('camera', picker.snapshot()),
    onBranded: () => searchBarcode('search', picker.snapshot()),
    multi: {
      ownerId: account.id,
      defaults: restore?.defaults ?? {date, group, time: new Date().toTimeString().slice(0, 5)},
      restore,
      onQueue: async (review, requestId) => {
        const ticket=await currentTicket();
        const {input,result}=review;
        if(!result.projection)throw Error(coreText('request.unavailable'));
        await queueCommand(result.revision,'food.multi.add',{...input,reviewToken:result.reviewToken,confirmed:true},{
          ticket,requestId,projection:result.projection,
        });
        return input.destination.kind==='recipe'?{item:{kind:'recipe',id:requestId}}:{};
      },
      onEdit: async row => {
        const snapshot = picker.snapshot();
        const serial = searchId;
        const kind = SELECTION_KIND_MAP[row.selection.kind];
        await currentTicket();
        const local = row.selection.kind === 'catalog' ? null : await localLibraryItem({kind, id:row.selection.id});
        const item = local ?? await request('/api/library/item?' + new URLSearchParams({kind, id: row.selection.id}));
        await currentTicket();
        if (serial !== searchId || !sheet.open) return;
        const openDetail = viewState => {
          pickerCleanup = mountFoodEntry({
            item,
            draft: row.entry,
            date,
            group,
            groups: diary.groups,
            revision: () => diary.revision,
            show,
            close,
            content,
            viewState,
            onChange: load,
            onBack: () => search(snapshot),
            onApply: value => search(snapshot, {applied: value}),
            onCopy: kind === 'food' ? kept => copyFood(item, () => openDetail(kept)) : undefined,
          });
        };
        openDetail();
      },
      onSaved: async result => {
        await load();
        close();
        notice.textContent = coreText(result.item?.kind === 'recipe' ? 'diary.recipeCreated' : 'diary.itemsAdded');
      },
    },
  });
  pickerCleanup = picker;
  await picker.ready;
  if (pickerCleanup !== picker) return;
  if (applied) picker.applyEntry(applied);
  if (selected) picker.select(selected.row, selected.entry);
  picker.returnFromDetail();
}

function searchBarcode(mode, snapshot) {
  const returnToSearch = () => search(snapshot);
  const barcodeHeader = title => header(title).replace('data-close', 'data-barcode-back');
  pickerCleanup = openBarcode({
    mode,
    show,
    close: returnToSearch,
    onMissing: returnToSearch,
    header: barcodeHeader,
    content,
    date: () => date,
    groups: diary.groups,
    group,
    onChange: load,
    revision: () => diary.revision,
    ...(snapshot.multi.enabled ? {onSelect: async (row, entry) => search(snapshot, {selected: {row, entry}})} : {}),
  });
}

async function edit({entry = null, id, kind, quantity, returnSearch} = {}) {
  const itemId = id ?? entry?.foodId ?? entry?.recipeId ?? entry?.mealId;
  const itemKind = kind ?? (entry?.recipeId ? 'recipe' : entry?.mealId ? 'meal' : 'food');
  if (!itemId) {
    show(`${header(coreText('diary.entry'))}<p class="empty">${e(coreText('diary.unsupported'))}</p>`);
    return;
  }
  const localItem = await localLibraryItem({kind: itemKind, id: itemId, entry});
  if (localItem) {
    foodEditor({item: localItem, entry, quantity, returnSearch});
    return;
  }
  show(`${header(t('diary.food'))}<p class="empty">${e(coreText('loading'))}</p>`);
  const serial = searchId;
  try {
    const query = new URLSearchParams({kind: itemKind, id: itemId, ...(entry ? {entryId: entry.id} : {})});
    const item = await request('/api/library/item?' + query);
    if (serial !== searchId || !sheet.open) return;
    foodEditor({item, entry, quantity, returnSearch});
  } catch (error) {
    if (serial === searchId) {
      content.innerHTML = header(t('diary.food')) + `<p class="sheet-message">${e(error.message)}</p>`;
    }
  }
}

function updateRecordDisplay(recordDisplay, {add = [], removeIds = new Set(), move = null} = {}) {
  if (!recordDisplay?.groups) return recordDisplay;
  const groups = recordDisplay.groups.map(g => ({
    ...g,
    records: g.records.filter(ref => !(ref.collection === 'entries' && (removeIds.has(ref.id) || (move && ref.id === move.id)))),
  }));
  const appendTo = (groupName, id) => {
    let target = groups.find(g => g.name === groupName) ?? groups[0];
    if (!target) {
      target = {name: groupName || 'Uncategorized', records: []};
      groups.push(target);
    }
    target.records.push({collection: 'entries', id});
  };
  if (move) appendTo(move.group, move.id);
  for (const row of add) appendTo(row.group, row.id);
  return {...recordDisplay, groups};
}

function foodEditor({item, entry, quantity, returnSearch, viewState}) {
  pickerCleanup = mountFoodEntry({
    item,
    entry,
    quantity,
    date,
    group,
    groups: diary.groups,
    viewState,
    onCopy:
      item.kind === 'food'
        ? kept => copyFood(item, () => foodEditor({item, entry, quantity, returnSearch, viewState: kept}))
        : undefined,
    revision: () => diary.revision,
    show,
    close,
    content,
    onChange: async () => {
      await load();
      if (view === 'foods') await library?.reload();
    },
    onOptimisticCommand: async ({type, value, item: targetItem}) => {
      const queued=await queueCommand(diary.revision,type,value,{projection:{entries:[{...value,name:targetItem?.resource?.name,facts:targetItem?.facts}],foods:targetItem?.kind==='food'?[targetItem.resource]:[]}});
      if (diary) {
        if (type === 'entry.delete') {
          diary = {
            ...diary,
            entries: diary.entries.filter(row => row.id !== value.id),
            recordDisplay: updateRecordDisplay(diary.recordDisplay, {removeIds: new Set([value.id])}),
          };
        } else if (type === 'entry.update') {
          const sameDay = value.date === date;
          diary = {
            ...diary,
            entries: sameDay
              ? diary.entries.map(row => (row.id === value.id ? {...row, ...value} : row))
              : diary.entries.filter(row => row.id !== value.id),
            recordDisplay: sameDay
              ? updateRecordDisplay(diary.recordDisplay, {move: {id: value.id, group: value.group}})
              : updateRecordDisplay(diary.recordDisplay, {removeIds: new Set([value.id])}),
          };
        } else if (type === 'entry.add' && value.date === date) {
          const added = {
            id: queued.requestId,
            ...value,
            name: targetItem?.resource?.name ?? '',
            facts: targetItem?.facts ?? {name: targetItem?.resource?.name ?? ''},
          };
          diary = {
            ...diary,
            entries: [...diary.entries, added],
            recordDisplay: updateRecordDisplay(diary.recordDisplay, {add: [added]}),
          };
        }
        const projected=await localDiaryView(date,diary);if(projected)diary=projected;
        if (view === 'diary') render();
      }

    },
    onBack: returnSearch ?? search,
    onAdjust: () =>
      openEntryAdjustment({
        kind: item.kind,
        revision:diary.revision,
        date: entry.date,
        id: entry.id,
        show,
        close,
        header,
        content,
        onSave: load,
        onBack: () => edit({entry}),
      }),
    onConflict: async () => {
      await load();
      if (!entry) return;
      const latest = diary.entries.find(row => row.id === entry.id);
      if (latest) edit({entry: latest});
      else close();
    },
  });
}

async function copyFood(item, onCancel) {
  let selection = item.copySelection;
  if (!selection && item?.resource?.id) {
    try {
      const full = await request('/api/library/item?' + new URLSearchParams({kind: 'food', id: item.resource.id}));
      selection = full.copySelection;
    } catch (error) {
      notice.textContent = error.message;
      onCancel?.();
      return;
    }
  }
  pickerCleanup = mountFoodCopy({
    selection,
    show,
    content,
    onCancel,
    onSaved: async () => {
      await load();
      if (view === 'foods') await library?.reload();
      close();
      notice.textContent = coreText('diary.foodCreated');
    },
  });
}

function photoLog(initialGroup) {
  if (!diary) return;
  return mountPhotoLog({
    show,
    close,
    header,
    content,
    date: () => date,
    groups: diary.groups,
    initialGroup,
    save: payload => queuePhoto(diary.revision,payload),
    onOptimisticSave: async ({payload, rows: optimisticRows}) => {
      const queued=await queuePhoto(diary.revision,payload,{entries:optimisticRows,foods:optimisticRows.map(row=>row.food).filter(Boolean)});
      const switchingView = view !== 'diary';
      if (switchingView) {
        leaveView();
        view = 'diary';
        if (tabBackHandle) {
          tabBackHandle.release({popHistory: false});
          tabBackHandle = null;
        }
        selectTab('diary-tab');
      }
      const sameDate = payload.date === date;
      if (!sameDate && payload.date) date = payload.date;
      if (diary && sameDate && optimisticRows?.length) {
        const added = optimisticRows.map((row, idx) => ({
          id: queued.requestId + '-' + idx,
          date: payload.date,
          time: payload.time,
          group: payload.group,
          foodId: row.foodId,
          name: row.name,
          ...(row.quantity !== undefined ? {quantity: row.quantity, unit: row.unit} : {amount: row.amount ?? 1}),
          facts: {
            name: row.name,
            portionLabel: row.portionLabel,
            calories: row.preview?.nutrition?.totals?.calories ?? null,
            protein: row.preview?.nutrition?.totals?.protein ?? null,
            carbs: row.preview?.nutrition?.totals?.carbs ?? null,
            fat: row.preview?.nutrition?.totals?.fat ?? null,
          },
        }));
        diary = {
          ...diary,
          entries: [...diary.entries, ...added],
          recordDisplay: updateRecordDisplay(diary.recordDisplay, {add: added}),
        };
      }
      if(diary){const projected=await localDiaryView(date,diary);if(projected)diary=projected;render();}

    },
    onChange: load,
  });
}

function recordEditor(kind, record, initialGroup) {
  return mountRecordEditor({kind, record, initialGroup, date, show, close, header, content, onChange: load});
}

function barcode(mode = 'camera') {
  if (!diary) return;
  openBarcode({
    mode,
    show,
    close,
    onMissing: () => search(),
    header,
    content,
    date: () => date,
    groups: diary.groups,
    group,
    onChange: load,
    revision: () => diary.revision,
  });
}

function textLog(initialGroup) {
  if (!diary) return;
  const log = mountTextLog({
    show,
    close,
    header,
    content,
    date: () => date,
    groups: diary.groups,
    initialGroup,
    onChange: load,
  });
  pickerCleanup = Object.assign(log.dispose, {back: log.back});
}

window.addEventListener('pagehide', () => {
  addMenu?.dispose();
  addMenu = null;
  diaryTools.dispose();
  loadId++;
  leaveView();
  if (tabBackHandle) {
    tabBackHandle.release({popHistory: false});
    tabBackHandle = null;
  }
  view = 'diary';
  pendingDiaryAction = null;
  clearPending();
  diary = null;
  close({popHistory: false});
  page.replaceChildren();
});

window.addEventListener('pageshow', event => {
  if (event.persisted) load();
});

load();
