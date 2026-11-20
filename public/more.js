import {mountAccount} from './account-screen.js';
import {pushBackHandler} from './back-history.js';
import {t} from './app-language.js';
import {coreText} from './core-cloud-messages.js';
import {escape as e} from './html.js';
import {mountDisplay} from './display.js';
import {mountTargets} from './targets.js';
import {mountFasting} from './fasting.js';
import {mountBackup} from './backup.js';
import {mountRepeats} from './repeats.js';
import {mountProfile} from './profile-settings.js';
import {openImports} from './imports.js';
import {mountReminders} from './reminders.js';
import {openGlucose, openCycle} from './health-controls.js';
import {openExport} from './charts.js';
import {moreRow as row, moreLink as link, moreGroup as group, moreHomeHeader, moreBackHeader} from './more-source/menu-view.js';

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
  ['offline', t('nav.offline')],
  ['repeats', t('mobileRepeat.title')],
  ['glucose', t('nav.glucose-timeline')],
  ['cycle', coreText('cycle.title')],
  ['imports', coreText('more.importCSV')],
  ['export', coreText('more.export')],
  ['backup', coreText('more.backup')],
];

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
    headerRoot.innerHTML = moreBackHeader(title);
    document.body.classList.add('more-destination');
  }

  function renderHome() {
    reset();
    screen = 'home';
    document.body.classList.remove('more-destination');
    headerRoot.innerHTML = moreHomeHeader(identity, query);
    root.innerHTML =
      group(main().map(([id, label, icon]) => row(id, label, icon)).join(''), 'mm-primary') +
      `<h2 class="mm-tools-title">${e(t('mobileMore.tools'))}</h2>` +
      group(tools().map(([id, label]) => (id === 'offline' ? link(label, '/offline.html') : row(id, label))).join(''), 'mm-tools') +
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

  function open(id) {
    if (screen === 'home') scroll = window.scrollY;
    if (id === 'account') {
      return childView(id, t('mobileMore.account'), host =>
        mountAccount({
          root: host,
          embedded: true,
          onIdentity: value => {
            setIdentity(value.name);
            onAccount(value);
          },
        }),
      );
    }
    if (id === 'profile') return childView(id, t('mobileMore.profile'), host => mountProfile({...ui, page: host, headerRoot, onExit: exitToHome}));
    if (id === 'reminders') return childView(id, t('nav.reminders'), host => mountReminders({root: host, ...ui}));
    if (id === 'glucose') return void openGlucose(ui);
    if (id === 'cycle') return void openCycle(ui);
    if (id === 'imports') return void openImports(ui);
    if (id === 'export') return void openExport(ui);
    if (id === 'targets') return childView(id, t('mobileMore.targets'), host => mountTargets({...ui, page: host, headerRoot, onExit: exitToHome}));
    if (id === 'fasting') return childView(id, t('mobileMore.fasting'), host => mountFasting({...ui, page: host, headerRoot, onBack: exitToHome}));
    if (id === 'backup') return childView(id, coreText('more.backup'), host => mountBackup({...ui, root: host}));
    if (id === 'repeats') {
      return childView(id, t('mobileRepeat.title'), host =>
        mountRepeats({...ui, page: host, headerRoot, backLabel: t('discover.back'), onExit: exitToHome}),
      );
    }
    if (id === 'display') return childView(id, t('mobileMore.display'), host => mountDisplay({root: host, headerRoot, onChange}));
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
        group(row('backup', coreText('more.backup')) + row('reminders', t('nav.reminders'))),
      );
    }
    if (id === 'about') {
      return section(
        id,
        t('mobileMore.about'),
        '<div class="mm-about"><img src="/favicon.svg" alt=""><h2>Nourishing</h2><p>' +
          e(coreText('more.version', {version: '1.0.8'})) +
          '</p></div>' +
          group(row('account', t('mobileMore.account')) + row('backup', coreText('more.yourData'))),
      );
    }
  }

  function stepBack() {
    if (screen === 'home') return false;
    if (child?.back?.()) return true;
    exitToHome();
    return true;
  }

  const click = event => {
    const button = event.target.closest('[data-more-open]');
    if (button) {
      event.preventDefault();
      open(button.dataset.moreOpen);
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
    refreshLanguage() {
      if (screen === 'home') renderHome();
      else open(screen);
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
