import {licenseNotices} from './more-source/license-notices.js';
import {appVersion} from './app-version.js';
import {mountAccount} from './account-screen.js';
import {pushBackHandler} from './back-history.js';
import {t} from './app-language.js';
import {coreText} from './core-cloud-messages.js';
import {accountMessage} from './account-cloud-messages.js';
import {escape as e} from './html.js';
import {mountDisplay} from './display.js';
import {mountTargets} from './targets.js';
import {mountFasting} from './fasting.js';
import {mountDeviceStorage} from './device-storage.js';
import {mountBackup} from './backup.js';
import {mountRepeats} from './repeats.js';
import {mountProfile} from './profile-settings.js';
import {openImports} from './imports.js';
import {mountReminders} from './reminders.js';
import {openGlucose, openCycle} from './health-controls.js';
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

const tools = () => [
  ['reminders', t('nav.reminders')],
  ['storage', coreText('more.storage')],
  ['repeats', t('mobileRepeat.title')],
  ['glucose', t('nav.glucose-timeline')],
  ['cycle', coreText('cycle.title')],
  ['imports', coreText('more.importCSV')],
  ['export', coreText('more.export')],
  ['backup', coreText('more.backup')],
];

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

  function popDestinationHistory({popHistory = true} = {}) {
    if (!backHandle) return;
    const handle = backHandle;
    backHandle = null;
    handle.release({popHistory});
  }

  function heading(title) {
    const help = (screen === 'notifications' || screen === 'bulk-delete')
      ? `<button type="button" ${screen==='notifications'?'data-notification-help':'data-bulk-help'} aria-label="${e(t('mobileMore.manual'))}">${moreIcon('help-circle')}</button>`
      : undefined;
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
      `<h2 class="mm-tools-title">${e(t('mobileMore.tools'))}</h2>` +
      group(tools().map(([id, label]) => row(id,label)).join(''), 'mm-tools') +
      `<p class="mm-empty" hidden>${e(t('mobileMore.noResults'))}</p>`;
    filter();
    window.scrollTo(0, scroll);
  }

  function exitToHome({fromPopState = false} = {}) {
    renderHome();
    if (!fromPopState) popDestinationHistory();
  }

  function filter() {
    const value = query.trim().toLocaleLowerCase();
    let visible = 0;
    for (const element of root.querySelectorAll('.mm-row')) {
      element.hidden = Boolean(value) && !element.textContent.toLocaleLowerCase().includes(value);
      if (!element.hidden) visible++;
    }
    for (const element of root.querySelectorAll('.mm-group')) {
      element.hidden = ![...element.children].some(item => !item.hidden);
    }
    root.querySelector('.mm-tools-title').hidden = root.querySelector('.mm-tools').hidden;
    root.querySelector('.mm-empty').hidden = visible > 0;
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

  function navigate(id) {
    if (screen === 'home') scroll = window.scrollY;
    if (id === 'account' || id === 'account-data' || id === 'bulk-delete') {
      return childView(id, id==='account'?t('mobileMore.account'):id==='bulk-delete'?accountMessage('accountCloud.bulk.title'):coreText('more.accountData'), host =>
        mountAccount({
          root: host,
          embedded: true,
          section: id,
          onIdentity: value => {
            setIdentity(value.name);
            onAccount(value);
          },
        }),
      );
    }
    if (id === 'profile') return childView(id, t('mobileMore.profile'), host => mountProfile({...ui, page: host, headerRoot, onExit: exitToHome}));
    if (id === 'notifications') return childView(id,coreText('more.notifications'),host=>mountReminders({root:host,notifications:true,...ui}));
    if (id === 'reminders') return childView(id, t('nav.reminders'), host => mountReminders({root: host, ...ui}));
    if (id === 'glucose') return void openGlucose(ui);
    if (id === 'cycle') return void openCycle(ui);
    if (id === 'imports') return void openImports(ui);
    if (id === 'export') return void openExport(ui);
    if (id === 'targets') return childView(id, t('mobileMore.targets'), host => mountTargets({...ui, page: host, headerRoot, onExit: exitToHome}));
    if (id === 'fasting') return childView(id, t('mobileMore.fasting'), host => mountFasting({...ui, page: host, headerRoot, onBack: exitToHome}));
    if (id === 'storage') return childView(id,coreText('more.storage'),host=>mountDeviceStorage({root:host}));
    if (id === 'backup') return childView(id, coreText('more.backup'), host => mountBackup({...ui, root: host}));
    if (id === 'repeats') {
      return childView(id, t('mobileRepeat.title'), host =>
        mountRepeats({...ui, page: host, headerRoot, backLabel: t('discover.back'), onExit: exitToHome}),
      );
    }
    if (id === 'display') return childView(id, t('mobileMore.display'), host => mountDisplay({root: host, headerRoot, onChange, date}));
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
            row('export', coreText('more.export')),
        ),
      );
    }
    if (id === 'support') {
      return section(
        id,
        t('mobileMore.support'),
        group(row('manual', t('mobileMore.manual')) + link(coreText('more.reportBug'), 'https://github.com/liangzixuan/nourishing/issues', true)) +
          group(row('backup', coreText('more.backup')) + row('reminders', t('nav.reminders'))),
      );
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
      return section(
        id,
        t('mobileMore.about'),
        '<div class="mm-about"><img src="/favicon.svg" alt=""><h2>Nourishing</h2><p>' +
          e(coreText('more.version', {version: appVersion})) +
          '</p><button type="button" class="mm-update-btn" data-more-check-update>' +
          e(coreText('more.checkUpdates')) +
          '</button><p class="mm-update-status" role="status" aria-live="polite"></p></div>' +
          group(row('licenses',coreText('more.licenses')) + row('account', t('mobileMore.account')) + row('backup', coreText('more.yourData'))),
      );
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
    const button = event.target.closest('[data-more-open]');
    const updateButton = event.target.closest('[data-more-check-update]');
    const help = event.target.closest('[data-bulk-help],[data-notification-help]');
    if (button) {
      event.preventDefault();
      open(button.dataset.moreOpen);
    } else if (help) {
      help.focus({preventScroll: true});
      if (screen === 'bulk-delete') {
        show(header(accountMessage('accountCloud.bulk.title')) + '<p>' + e(accountMessage('accountCloud.bulk.choose')) + '</p><p>' + e(accountMessage('accountCloud.bulk.scope')) + '</p><p>' + e(accountMessage('accountCloud.bulk.irreversible')) + '</p>');
      } else {
        show(header(t('mobileMore.manual')) + manualTopics('notifications'));
      }
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
      popDestinationHistory({popHistory: false});
      document.body.classList.remove('more-mobile', 'more-destination');
    },
  };
}
