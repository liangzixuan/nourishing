import {supportEmail} from './support-contact.js';
import {licenseNotices} from './more-source/license-notices.js';
import {appVersion} from './app-version.js';
import {mountAccount} from './account-screen.js';
import {pushBackHandler} from './back-history.js';
import {t} from './app-language.js';
import {coreText} from './core-cloud-messages.js';
import {accountMessage} from './account-cloud-messages.js';
import {escape as e} from './html.js';
import {mountDisplay} from './display.js';
import {mountTargets,targetDestinations} from './targets.js';
import {mountFasting} from './fasting.js';
import {mountDeviceStorage} from './device-storage.js';
import {mountBackup} from './backup.js';
import {mountRepeats} from './repeats.js';
import {mountProfile} from './profile-settings.js';
import {openImports} from './imports.js';
import {mountReminders} from './reminders.js';
import {visibleDiaryCalendarKinds} from './snapshot-source/diary-calendar.mjs';
import {waterText} from './water-messages.js';
import {dc} from './discover-cloud-messages.js';
import {openExport} from './charts.js';
import {moreRow as row, moreLink as link, moreGroup as group, moreIcon, moreHomeHeader, moreBackHeader} from './more-source/menu-view.js';

const main = () => [
  ['account', t('mobileMore.account'), 'account-cog'],
  ['profile', t('mobileMore.profile'), 'account-circle'],
  ['targets', t('mobileMore.targets'), 'bullseye'],
  ['fasting', t('mobileMore.fasting'), 'timer-outline'],
  ['display', t('mobileMore.display'), 'cellphone'],
  ['sharing', t('mobileMore.sharing'), 'share'],
  ['support', t('mobileMore.support'), 'help-circle'],
  ['about', t('mobileMore.about'), 'information'],
];

// Each match opens an existing screen or editor. Searching never changes a setting.
function settingsIndex() {
  const rows=[];
  const add=(parents,id,label,option)=>rows.push({parents,id,label,option});
  const account=['account'], data=['account','account-data'];
  add(account,'account-data',coreText('more.accountData'));
  add(account,'notifications',coreText('more.notifications'));
  add(account,'notifications',coreText('more.allowNotifications'));
  for (const [action,key] of [['name','editName'],['email','changeEmail'],['password','changePassword']])
    add([], 'account', accountMessage('accountCloud.'+key), action);
  add(data,'bulk-delete',accountMessage('accountCloud.bulk.title'));
  add(data,'delete-account',accountMessage('accountCloud.bulk.account'));
  add(data,'storage',coreText('more.storage'));
  for (const [id,label] of targetDestinations()) add([], 'targets',label,id);
  for (const [id,label] of [
    ['age',t('printDocument.stored.age')],['sex',dc('sex')],['weight',t('measurementCatalog.metric.weight')],
    ['height',t('measurementCatalog.metric.height')],['bodyFat',t('measurementCatalog.metric.body-fat')],
  ]) add([], 'profile',label,id);
  for (const [screen,label] of [
    ['energyUnit',t('mobileDisplay.units')],['summaryNutrient',t('mobileDisplay.summaryNutrient')],
    ['diary',t('mobileDisplay.diary')],['calendar',t('mobileDisplay.calendar')],['theme',t('mobileDisplay.theme')],
    ['appLanguage',t('mobileDisplay.appLanguage')],['fontScale',t('mobileDisplay.fontScale')],
    ['pauseLife',t('mobileDisplay.pauseLife')],['dashboard',t('discover.title.dashboard-settings')],
    ['water',waterText('settings')],['groupSubtotals',t('mobileDisplay.groupSubtotals')],['quickAdd',t('mobileDisplay.quickAdd')],
  ]) add([],'display',label,{screen});
  for(const key of ['showTimestamp','showEnergy','showMacros','showHighlights','showWater','showGroups','alwaysExpandMeals','groups']){
    const screen=['showGroups','alwaysExpandMeals','groups'].includes(key)?'diary':'';
    add([],'display',t('mobileDisplay.'+key),{screen,control:key});
  }
  for(const kind of visibleDiaryCalendarKinds)
    add([],'display',t('mobileDisplay.kind.'+kind),{screen:'calendar',control:'calendar:'+kind});
  add([],'display',t('discover.title.streak-settings'),{screen:'dashboard',section:'streak'});
  for(const key of ['nutrition','news','coach','fasting','energy','weight','sleep','weightGoal']){
    const control={news:'newsVisible',weightGoal:'weightGoalVisible'}[key]??key;
    add([],'display',t('discover.show.'+key),{screen:'dashboard',control});
  }
  for(const [key,label] of [['glucose',dc('showGlucose')],['cycle',dc('showCycleTracking')]])
    add([],'display',label,{screen:'dashboard',control:key});
  for(const [id,label] of [['foods',t('mobileMore.foods')],['reports',t('mobileMore.reports')],['backup',coreText('more.backup')],['imports',coreText('more.importCSV')],['export',coreText('more.export')]])
    add(['sharing'],id,label);
  for(const [section,key] of [['history','history'],['scheduled','scheduled'],['stats','stats']])
    add([],'fasting',t('discover.fasting.'+key),section);
  add([], 'about',coreText('more.version'),'version');
  add([], 'about',coreText('more.checkUpdates'),'updates');
  add([], 'support',coreText('more.contactUs'),'contact');
  add([], 'support',coreText('more.reportBug'),'issue');
  add(['support'],'manual',t('mobileMore.manual'));
  add(['support'],'reminders',t('nav.reminders'));
  add(['about'],'licenses',coreText('more.licenses'));
  for(const [name] of licenseNotices)add(['about','licenses'],'license/'+name,name);
  return rows;
}
const searchable=value=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase();

function manualTopics(expanded) {
  const topics = [
    ['diary', t('discover.nav.diary'), coreText('manual.diary')],
    ['foods', t('mobileMore.foods'), coreText('manual.foods')],
    ['reports', t('mobileMore.reports'), coreText('manual.reports')],
    ['display', t('mobileMore.display'), coreText('manual.display')],
    ['notifications', coreText('more.notifications'),
      accountMessage('accountCloud.allowNotificationsInYourBrowserSettings'), accountMessage('reminders.foodShortcutHint'),
      accountMessage('reminders.groupHint'), accountMessage('reminders.weightShortcutHint')],
  ];
  return group(topics.map(([id, title, ...paragraphs]) =>
    `<details class="mm-manual-topic" data-manual-topic="${id}"${id === expanded ? ' open' : ''}><summary>${e(title)}</summary>${paragraphs.map(p => `<p>${e(p)}</p>`).join('')}</details>`,
  ).join(''));
}

/** Adapts the existing More layout to authenticated cloud features. */
export function mountMore({
  page,
  headerRoot,
  date,
  show,
  close,
  header,
  content,
  onChange = async () => {},
  onDiary,
  onFoods,
  onDiscover,
  identity = '',
  onAccount = () => {},
}) {
  let disposed = false;
  let child = null;
  let screen = 'home';
  let query = '';
  let searchRows = [];
  let scroll = 0;
  const parents = [];
  let backHandle = null;

  const events = new AbortController();
  const signal = events.signal;
  const root = document.createElement('section');
  root.className = 'more-page';
  page.replaceChildren(root);
  document.body.classList.add('more-mobile');

  const ui = {date, show, close, header, content, onChange, onDiary};
  const alive = () => !disposed && root.isConnected;

  function setIdentity(name) {
    identity = name || '';
    if (screen === 'home' && alive()) {
      const label = headerRoot.querySelector('.mm-identity');
      if (label) label.textContent = identity;
    }
  }

  function reset() {
    child?.dispose();
    child = null;
  }

  function pushDestinationHistory() {
    if (backHandle) return;
    backHandle = pushBackHandler(() => {
      if (!alive() || screen === 'home') return;
      if (child?.back?.()) return 'keep';
      if (returnToParent()) return 'keep';
      backHandle = null;
      renderHome();
    });
  }

  function popDestinationHistory() {
    if (!backHandle) return;
    const handle = backHandle;
    backHandle = null;
    handle.release();
  }

  function heading(title) {
    let help;
    if (screen === 'bulk-delete') {
      help = `<button type="button" data-bulk-help aria-label="${e(t('mobileMore.manual'))}">${moreIcon('help-circle')}</button>`;
    }
    headerRoot.innerHTML = moreBackHeader(title, help);
    document.body.classList.add('more-destination');
  }

  function renderHome() {
    reset();
    parents.length = 0;
    screen = 'home';
    document.body.classList.remove('more-destination');
    headerRoot.innerHTML = moreHomeHeader(identity, query);
    root.innerHTML =
      group(main().map(([id, label, icon]) => row(id, label, icon)).join(''), 'mm-primary') +
      '<section class="mm-group mm-search-results" hidden></section>' +
      `<p class="mm-empty" hidden>${e(t('mobileMore.noResults'))}</p>`;
    searchRows=settingsIndex();
    filter();
    window.scrollTo(0, scroll);
  }

  function exitToHome() {
    renderHome();
    popDestinationHistory();
  }

  function filter() {
    const terms=searchable(query.trim()).split(/\s+/).filter(Boolean);
    const matches=text=>terms.every(term=>searchable(text).includes(term));
    const primary=root.querySelector('.mm-primary');
    for(const item of primary.children)item.hidden=!matches(item.textContent);
    primary.hidden=![...primary.children].some(item=>!item.hidden);
    const titles=new Map(main().map(([id,label])=>[id,label]));
    titles.set('account-data',coreText('more.accountData'));
    titles.set('licenses',coreText('more.licenses'));
    const displayPages={calendar:t('mobileDisplay.calendar'),dashboard:t('discover.title.dashboard-settings'),diary:t('mobileDisplay.diary')};
    const results=root.querySelector('.mm-search-results');
    results.innerHTML=terms.length?searchRows.map(({id,label,parents,option},index)=>{
      const trail=[...parents,...(option?[id]:[])].map(parent=>titles.get(parent)).filter(Boolean);
      if(id==='display' && option && (option.control||option.section) && displayPages[option.screen])trail.push(displayPages[option.screen]);
      const path=trail.join(' › ');
      if(!matches(path+' '+label))return '';
      return `<button type="button" class="mm-row" data-more-result="${index}"><span>${e(label)}<small class="mm-search-parent">${e(path)}</small></span>${moreIcon('chevron-right','mm-chevron')}</button>`;
    }).join(''):'';
    results.hidden=!results.childElementCount;
    root.querySelector('.mm-empty').hidden=!primary.hidden||!results.hidden;
  }

  function childView(id, title, mount) {
    reset();
    screen = id;
    pushDestinationHistory(id);
    heading(title);
    root.innerHTML = '<div class="mm-destination"></div>';
    child = mount(root.firstElementChild);
    window.scrollTo(0, 0);
  }

  function section(id, title, markup) {
    reset();
    screen = id;
    pushDestinationHistory(id);
    heading(title);
    root.innerHTML = markup;
    window.scrollTo(0, 0);
  }

  function returnToParent() {
    const parent = parents.pop();
    if (!parent) return false;
    navigate(parent);
    return true;
  }

  function open(id) {
    const previous = screen;
    navigate(id);
    if (screen !== previous && previous !== 'home') parents.push(previous);
  }

  function navigate(id,option) {
    if (screen === 'home') scroll = window.scrollY;
    if (id === 'account' || id === 'account-data' || id === 'delete-account' || id === 'bulk-delete') {
      return childView(id, id==='account'?t('mobileMore.account'):id==='delete-account'?accountMessage('accountCloud.deleteAccount'):id==='bulk-delete'?accountMessage('accountCloud.bulk.title'):coreText('more.accountData'), host =>
        mountAccount({
          root: host,
          embedded: true,
          section: id,
          initialAction:option,
          onIdentity: value => {
            setIdentity(value.name);
            onAccount(value);
          },
        }),
      );
    }
    if (id === 'profile') return childView(id, t('mobileMore.profile'), host => mountProfile({...ui, initialField:option, page: host, headerRoot, onExit: exitToHome}));
    if (id === 'notifications') return childView(id,coreText('more.notifications'),host=>mountReminders({root:host,notifications:true,...ui}));
    if (id === 'reminders') return childView(id, t('nav.reminders'), host => mountReminders({root: host, ...ui}));
    if (id === 'imports') return void openImports(ui);
    if (id === 'export') return void openExport(ui);
    if (id === 'targets') return childView(id, t('mobileMore.targets'), host => mountTargets({...ui, initialScreen:option, page: host, headerRoot, onExit: exitToHome}));
    if (id === 'fasting') return childView(id, t('mobileMore.fasting'), host => mountFasting({...ui, initialSection:option, page: host, headerRoot, onBack: exitToHome}));
    if (id === 'storage') return childView(id,coreText('more.storage'),host=>mountDeviceStorage({root:host}));
    if (id === 'backup') return childView(id, coreText('more.backup'), host => mountBackup({...ui, root: host}));
    if (id === 'repeats') {
      return childView(id, t('mobileRepeat.title'), host =>
        mountRepeats({...ui, page: host, headerRoot, backLabel: t('discover.back'), onExit: exitToHome}),
      );
    }
    if (id === 'display') return childView(id, t('mobileMore.display'), host => mountDisplay({root: host, initialSetting:option, headerRoot, onChange, date}));
    if (id === 'foods') return onFoods?.();
    if (id === 'reports') return onDiscover?.('report');
    if (id === 'sharing') {
      return section(
        id,
        t('mobileMore.sharing'),
        group(
          (onFoods ? row('foods', t('mobileMore.foods')) : '') +
            (onDiscover ? row('reports', t('mobileMore.reports')) : '') +
            row('backup', coreText('more.backup')) +
            row('imports', coreText('more.importCSV')) + row('export', coreText('more.export')),
        ),
      );
    }
    if (id === 'support') {
      section(
        id,
        t('mobileMore.support'),
        group(row('manual', t('mobileMore.manual')) + link(coreText('more.contactUs'), 'mailto:'+supportEmail) + link(coreText('more.reportBug'), 'https://github.com/liangzixuan/nourishing/issues', true), 'mm-support-links') +
          group(row('backup', coreText('more.backup')) + row('reminders', t('nav.reminders')), 'mm-support-links'),
      );
      const links=root.querySelectorAll('.mm-support-links a');
      if(option==='contact')links[0]?.focus();
      if(option==='issue')links[1]?.focus();
      return;
    }
    if (id === 'manual') {
      return section(id, t('mobileMore.manual'), manualTopics());
    }
    if (id === 'licenses') {
      return section(id,coreText('more.licenses'),group(licenseNotices.map(([name])=>row('license/'+name,name)).join('')));
    }
    if (id.startsWith('license/')) {
      const notice = licenseNotices.find(([name]) => 'license/'+name === id);
      if (!notice) return;
      const [name,path] = notice;
      section(id, name, '<pre class="mm-license" role="status"></pre>');
      const text = root.querySelector('.mm-license');
      text.textContent = coreText('loading');
      fetch(path).then(response => {
        if (!response.ok) throw Error(coreText('request.unavailable'));
        return response.text();
      }).then(value => { text.textContent = value; }).catch(() => { text.textContent = coreText('request.unavailable'); });
      return;
    }
    if (id === 'about') {
      section(
        id,
        t('mobileMore.about'),
        group(row('licenses',coreText('more.licenses')) +
          `<dl class="mm-version" tabindex="-1"><dt>${e(coreText('more.version'))}</dt><dd>${e(appVersion)}</dd></dl>`, 'mm-about-details') +
        group(`<button type="button" class="mm-row" data-more-check-update><span>${e(coreText('more.checkUpdates'))}</span></button><p class="mm-update-status" role="status" aria-live="polite"></p>` +
          row('account', t('mobileMore.account')) + row('backup', coreText('more.yourData'))),
      );
      if(option==='version')root.querySelector('.mm-version')?.focus();
      if(option==='updates')root.querySelector('[data-more-check-update]')?.focus();
    }
  }

  async function checkForUpdates(button) {
    if (button.disabled) return;
    const status = root.querySelector('.mm-update-status');
    button.disabled = true;
    if (status) status.textContent = coreText('more.checkingUpdates');
    let result;
    const manualCheck = globalThis[Symbol.for('nourishing.checkUpdate')];
    if (typeof manualCheck === 'function') {
      result = await manualCheck();
    } else if (!navigator.onLine) {
      result = {status: 'offline'};
    } else if ('serviceWorker' in navigator && window.isSecureContext) {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/');
        if (reg) {
          await reg.update();
          result = {status: reg.waiting || reg.installing ? 'update' : 'up-to-date'};
        } else {
          result = {status: 'up-to-date'};
        }
      } catch {
        result = {status: 'error'};
      }
    } else {
      result = {status: 'up-to-date'};
    }
    if (!alive() || !button.isConnected) return;
    button.disabled = false;
    if (status) {
      status.textContent =
        result?.status === 'update'
          ? coreText('more.updateReady')
          : result?.status === 'offline'
            ? coreText('more.updateOffline')
            : result?.status === 'up-to-date'
              ? coreText('more.upToDate')
              : coreText('more.updateFailed');
    }
  }

  function stepBack() {
    if (screen === 'home') return false;
    if (child?.back?.() || returnToParent()) return true;
    exitToHome();
    return true;
  }

  const click = event => {
    const result = event.target.closest('[data-more-result]');
    const button = event.target.closest('[data-more-open]');
    const updateButton = event.target.closest('[data-more-check-update]');
    const help = event.target.closest('[data-bulk-help]');
    if(result){
      const match=searchRows[Number(result.dataset.moreResult)];
      if(!match)return;
      // Sheets and cross-tab links use the same parent screen as a manual visit.
      const overlay=['export','imports','foods','reports'].includes(match.id);
      if(overlay && match.parents.length)navigate(match.parents.at(-1));
      navigate(match.id,match.option);
      if(!overlay)parents.push(...match.parents);
    } else if (button) {
      event.preventDefault();
      open(button.dataset.moreOpen);
    } else if (help) {
      help.focus({preventScroll: true});
      show(header(accountMessage('accountCloud.bulk.title')) + '<p>' + e(accountMessage('accountCloud.bulk.choose')) + '</p><p>' + e(accountMessage('accountCloud.bulk.scope')) + '</p><p>' + e(accountMessage('accountCloud.bulk.irreversible')) + '</p>');
    } else if (updateButton) {
      event.preventDefault();
      void checkForUpdates(updateButton);
    } else if (event.target.closest('[data-more-back]')) {
      event.preventDefault();
      stepBack();
    }
  };

  headerRoot.addEventListener('click', click, {signal});
  root.addEventListener('click', click, {signal});
  headerRoot.addEventListener(
    'input',
    event => {
      if (event.target.matches('[data-more-search]')) {
        query = event.target.value;
        scroll = 0;
        filter();
      }
    },
    {signal},
  );

  renderHome();
  return {
    setIdentity,
    open,
    refreshLanguage() {
      if (screen === 'home') renderHome();
      else navigate(screen);
    },
    back() {
      return stepBack();
    },
    dispose() {
      disposed = true;
      reset();
      events.abort();
      popDestinationHistory();
      document.body.classList.remove('more-mobile', 'more-destination');
    },
  };
}
