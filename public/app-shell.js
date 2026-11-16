import {bottomNavigation,iconButton,escape as e,button} from './dashboard-source/discover-ui.js';

const screens={'discover-tab':'dashboard','diary-tab':'diary','foods-tab':'foods','settings-tab':'more','add-food':'add'};
export function createAppShell({headerRoot,dateBar,navigation}){
 navigation.innerHTML=bottomNavigation('diary');
 for(const [id,screen] of Object.entries(screens))navigation.querySelector(`[data-discover="shell-${screen}"]`).id=id;
 const observer=new ResizeObserver(()=>document.body.style.setProperty('--dc-nav-space',Math.ceil(navigation.getBoundingClientRect().height)+'px'));
 observer.observe(navigation);
 return {
  select(id){
   for(const control of navigation.querySelectorAll('button')){control.classList.toggle('active',control.id===id);if(control.id===id)control.setAttribute('aria-current','page');else control.removeAttribute('aria-current');}
   document.body.classList.toggle('diary-mobile',id==='diary-tab');
   document.body.classList.toggle('discover-home',id==='discover-tab');
   headerRoot.hidden=id==='diary-tab';dateBar.hidden=id!=='diary-tab';
  },
  dispose(){observer.disconnect();}
 };
}

export function discoverHeader({root,tab,onTab,onNews,onSettings,ready=true}){
 const tabs=[['dashboard','Dashboard'],['charts','Charts'],['report','Report'],['snapshots','Snapshots']];
 root.innerHTML=`<div class="dc-brand-row"><div class="dc-brand"><img class="nourishing-app-icon" src="/favicon.svg" alt=""><strong>Nourishing</strong></div><div class="dc-header-actions">${['dashboard','snapshots'].includes(tab)?iconButton('campaign','Newsfeed','shell-newsfeed'):''}${tab==='dashboard'?iconButton('settings','Dashboard Settings','shell-settings'):''}</div></div><nav class="dc-tabs" aria-label="Discover">${tabs.map(([id,label])=>button(e(label),'tab-'+id,tab===id?'active':'',`${tab===id?'aria-current="page"':''} data-tab="${id}"`)).join('')}</nav>`;
 root.querySelectorAll('[data-tab]').forEach(control=>control.onclick=()=>onTab(control.dataset.tab));
 const news=root.querySelector('[data-discover="shell-newsfeed"]'),settings=root.querySelector('[data-discover="shell-settings"]');
 if(news){news.disabled=!ready;news.onclick=onNews;}
 if(settings){settings.disabled=!ready;settings.onclick=onSettings;}
}
