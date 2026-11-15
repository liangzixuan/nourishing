import {formatMessage} from './message-format.js';
export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const symbol=name=>name==='arrow_drop_down'?'<svg class="dc-symbol-svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m7 10 5 5 5-5z"/></svg>':name==='campaign'?'<svg class="dc-symbol-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h3l12-3v12L6 15H3zM6 9v6M8 15l1 7h3l-1-6M21 6l2-2M21 12h2M21 18l2 2"/></svg>':name==='smartwatch'?'<svg class="dc-symbol-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="6" width="14" height="12" rx="4"/><path d="M8 6 9 2h6l1 4M8 18l1 4h6l1-4M12 9v3l2 1"/></svg>':`<span class="material-symbols-rounded" aria-hidden="true">${name}</span>`;
export const button=(label,action,cls='',extra='')=>`<button type="button" class="dc-button ${cls}" data-discover="${action}" ${extra}>${label}</button>`;
export const iconButton=(name,label,action)=>button(symbol(name),action,'dc-icon',`aria-label="${escape(label)}"`);
export const row=(label,control)=>`<div class="dc-row">${label?`<span>${label}</span>`:''}${control}</div>`;
export const toggle=(label,key,value)=>row(label,`<input aria-label="${escape(label)}" class="dc-switch" type="checkbox" role="switch" data-pref="${key}" ${value?'checked':''}>`);
export const card=(title,body,action,cls='')=>`<section class="dc-card ${cls}">${title?`<div class="dc-card-heading">${action?button(`<h2>${title}</h2>${symbol('chevron_right')}`,action,'dc-card-link'):`<h2>${title}</h2>`}</div>`:''}${body}</section>`;
export const ranges=[['today','Today'],['7','Last 7 Days'],['14','Last 2 Weeks'],['21','Last 3 Weeks'],['28','Last 4 Weeks'],['56','Last 8 Weeks'],['90','Last 3 Months'],['180','Last 6 Months'],['365','Last Year'],['all','All Time'],['custom','Custom Range']];
export const rangeLabel=(value,language='en')=>formatMessage(language,'discover.range.'+(ranges.some(([key])=>key===value)?value:'7'));
export const widgets=['Consumed','Expenditure','Energy Budget','Macro Targets','Highlighted Nutrients','Nutrition Scores'];
export const goals=['Health','Longevity','Weight Loss','Weight Gain','Strength','Build Muscle','Manage Condition','Athletic Performance','Improve Mood','Improve Sleep','Improve Energy','Research','Tracking','Accountability','Motivation','Education','GLP-1 Medication','Support'];
export const diets=['None','Carnivore','Keto','Low Carb','Low Fat','Mediterranean','Paleo','Pescatarian','Vegan','Vegetarian','Dairy Free','Gluten Free','Fasting'];
export const coachChoices=value=>value.split(', ').filter(Boolean);
/** Keep saved text and order; only remove deselected choices or append new ones. */
export function updateCoachChoices(saved,selected){
 const previous=coachChoices(saved),chosen=new Set(selected);
 if(previous.every(value=>chosen.has(value))&&selected.every(value=>previous.includes(value)))return saved;
 return [...previous.filter(value=>chosen.has(value)),...selected.filter(value=>!previous.includes(value))].join(', ');
}
export function resolveRange(choice,today,state,prefs){
 if(choice==='custom')return {from:prefs.customFrom,to:prefs.customTo};
 let days=choice==='today'?1:Number(choice);
 if(choice==='all'){
  const dates=['entries','biometrics','exercises','notes','water'].flatMap(key=>(state[key]??[]).map(row=>row.date)).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&date<=today).sort();
  const from=dates[0]??today;days=Math.min(3660,Math.max(1,Math.round((Date.parse(today)-Date.parse(from))/86400000)+1));
 }
 return {from:new Date(Date.parse(today+'T12:00:00Z')-(days-1)*86400000).toISOString().slice(0,10),to:today};
}
export function chartMarkup(id,labels){return `<div class="dc-chart"><canvas data-dc-chart="${id}" role="img" aria-label="${escape(labels.join(', '))}"></canvas></div><div class="dc-legend">${labels.map((label,i)=>`<div><i class="dc-series dc-series-${id==='weight'?(i===0?'weight':'target'):i}"></i>${escape(label)}</div>`).join('')}</div>`;}
export function setDashboardHeaderReady(ready){
 if(!document.body.classList.contains('discover-home'))return;
 for(const action of ['shell-settings','shell-newsfeed']){const button=document.querySelector('.topbar [data-discover="'+action+'"]');if(button)button.disabled=!ready;}
}
export const isMobileShell=()=>matchMedia('(max-width:700px)').matches||new URLSearchParams(location.search).get('mobile')==='1';
let navigationSizeObserver;
export function installDiscoverShell({view,navigate,openAction,language="en"}){
 const text=(key,values)=>formatMessage(language,'discover.'+key,values);
 const enabled=isMobileShell();
 navigationSizeObserver?.disconnect();navigationSizeObserver=null;document.body.style.removeProperty('--dc-nav-space');
 document.body.classList.toggle('discover-mobile',enabled);if(!enabled)return false;
 const discover=['dashboard','trends','nutrition-report','progress'].includes(view),header=document.querySelector('.topbar');
 document.body.classList.toggle('discover-home',view==='dashboard');
 if(discover)header.innerHTML=`<div class="dc-brand-row"><div class="dc-brand"><img class="nourishing-app-icon" src="/favicon.svg" alt=""><strong>Nourishing</strong></div><div class="dc-header-actions">${['dashboard','progress'].includes(view)?iconButton('campaign',text('title.newsfeed'),'shell-newsfeed'):''}${view==='progress'?'':iconButton('settings',text(view==='dashboard'?'title.dashboard-settings':view==='nutrition-report'?'title.report-settings':'settings'),'shell-settings')}</div></div><nav class="dc-tabs" aria-label="${escape(text('nav.tabs'))}">${[['dashboard','dashboard'],['trends','charts'],['nutrition-report','report'],['progress','snapshots']].map(([id,label])=>button(escape(text('nav.'+label)),'shell-'+id,view===id?'active':'',view===id?'aria-current="page"':'')).join('')}</nav>`;
 const bottom=document.createElement('nav');bottom.className='dc-bottom';bottom.setAttribute('aria-label',text('nav.main'));bottom.innerHTML=bottomNavigation(view,language);document.querySelector('.shell').append(bottom);
 navigationSizeObserver=new ResizeObserver(()=>{if(bottom.isConnected)document.body.style.setProperty('--dc-nav-space',Math.ceil(bottom.getBoundingClientRect().height)+'px');});navigationSizeObserver.observe(bottom);
 const click=event=>{const el=event.target.closest('[data-discover^="shell-"]');if(!el)return;const id=el.dataset.discover.slice(6);if(id==='settings'&&view==='nutrition-report')openAction('report-settings');else if(id==='newsfeed'||id==='settings'&&view==='dashboard')openAction(id==='settings'?'dashboard-settings':'newsfeed');else if(id==='add')openAction('add');else if(id==='more')openAction('more');else void navigate(id);};header.addEventListener('click',click);bottom.addEventListener('click',click);return true;
}

export function bottomNavigation(view,language="en"){const text=key=>formatMessage(language,"discover.nav."+key);const discover=['dashboard','trends','nutrition-report','progress'].includes(view);return [['dashboard','discover','chart',discover],['diary','diary','notebook',view==='diary'],['add','add','plus',false],['foods','foods','apple',['foods','repeats','oracle','suggest'].includes(view)],['more','more','more',!discover&&!['diary','foods','repeats','oracle','suggest'].includes(view)]].map(([id,label,icon,selected])=>button(`<span class="dc-nav-icon dc-nav-icon-${icon}" aria-hidden="true"></span>`+(id==='add'?'':`<span class="dc-nav-label">${escape(text(label))}</span>`),'shell-'+id,`${selected?'active':''} ${id==='add'?'dc-add':''}`,`aria-label="${escape(text(label))}" ${selected?'aria-current="page"':''}`)).join('');}
