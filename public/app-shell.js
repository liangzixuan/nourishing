import {bottomNavigation,iconButton,escape as e,button} from './dashboard-source/discover-ui.js';
import {uiLanguage,t} from './app-language.js';
import {coreText} from './core-cloud-messages.js';

const screens={'discover-tab':'dashboard','diary-tab':'diary','foods-tab':'foods','settings-tab':'more','add-food':'add'};
export function createAppShell({headerRoot,dateBar,navigation}){
 let selected='diary-tab';
 function labels(){navigation.innerHTML=bottomNavigation(screens[selected],uiLanguage());for(const [id,screen] of Object.entries(screens))navigation.querySelector(`[data-discover="shell-${screen}"]`).id=id;navigation.setAttribute('aria-label',t('discover.nav.main'));}
 labels();
 const observer=new ResizeObserver(()=>document.body.style.setProperty('--dc-nav-space',Math.ceil(navigation.getBoundingClientRect().height)+'px'));
 observer.observe(navigation);
 return {
  select(id){
   selected=id;
   for(const control of navigation.querySelectorAll('button')){control.classList.toggle('active',control.id===id);if(control.id===id)control.setAttribute('aria-current','page');else control.removeAttribute('aria-current');}
   document.body.classList.toggle('diary-mobile',id==='diary-tab');
   document.body.classList.toggle('discover-home',id==='discover-tab');
   headerRoot.hidden=id==='diary-tab';dateBar.hidden=id!=='diary-tab';
  },
  refreshLanguage(){labels();},
  dispose(){observer.disconnect();}
 };
}

// Route the copied navigation controls through the live application shell.
export function appendShellNavigation(root,navigate){
 const navigation=document.querySelector('.app-shell > .app-nav');
 if(!navigation)return;
 const clone=navigation.cloneNode(true),originals=[...navigation.querySelectorAll('button')];
 clone.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
 clone.querySelectorAll('button').forEach((button,index)=>{
  button.onclick=()=>navigate(originals[index]);
 });
 root.append(clone);
}

export function discoverHeader({root,tab,onTab,onNews,onSettings,ready=true}){
 const tabs=['dashboard','charts','report','snapshots'].map(id=>[id,t('discover.nav.'+id)]);
 const settingsLabel={dashboard:t('discover.title.dashboard-settings'),charts:coreText('charts.manage'),report:t('discover.title.report-settings')}[tab];
 root.innerHTML=`<div class="dc-brand-row"><div class="dc-brand"><img class="nourishing-app-icon" src="/favicon.svg" alt=""><strong>Nourishing</strong></div><div class="dc-header-actions">${iconButton('campaign',t('discover.title.newsfeed'),'shell-newsfeed')}${settingsLabel?iconButton('settings',settingsLabel,'shell-settings'):''}</div></div><nav class="dc-tabs" aria-label="${e(t('discover.nav.discover'))}">${tabs.map(([id,label])=>button(e(label),'tab-'+id,tab===id?'active':'',`${tab===id?'aria-current="page"':''} data-tab="${id}"`)).join('')}</nav>`;
 const nav=root.querySelector('.dc-tabs'),active=nav.querySelector('[aria-current=page]');
 if(active&&nav.scrollWidth>nav.clientWidth){
  nav.scrollLeft=Math.max(0,active.getBoundingClientRect().right-nav.getBoundingClientRect().right);
 }
 root.querySelectorAll('[data-tab]').forEach(control=>control.onclick=()=>onTab(control.dataset.tab));
 const news=root.querySelector('[data-discover="shell-newsfeed"]'),settings=root.querySelector('[data-discover="shell-settings"]');
 if(news){news.onclick=onNews;}
 if(settings){settings.disabled=!ready;settings.onclick=onSettings;}
}
