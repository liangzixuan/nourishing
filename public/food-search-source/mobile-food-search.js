// Source search surface with opt-in reviewed Multi-Add.
import {FoodMultiAdd} from './food-multi-add.js';
import {CatalogSearch} from './catalog-search.js';
import {escape as e} from '../html.js';
import {formatMessage} from './message-format.js';
import {searchSource} from './mobile-food-search-row.js';
import {readFoodSearchPreferences,writeFoodSearchPreferences} from './food-search-preferences.js';

const categories=['all','favorites','custom','common','supplements','brands','restaurants','beverages'];
const sorts=['az','za','recent','frequent','best'];
// Icons use explicit vectors, so a missing icon-font glyph cannot show its name.
const glyph=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
const symbols={close:glyph('M6 6l12 12M6 18 18 6'),search:glyph('M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0'),options:glyph('M3 6h7m4 0h7M3 12h12m4 0h2M3 18h3m4 0h11M10 3v6m5 0v6m-9 0v6'),scan:glyph('M3 7V3h4m10 0h4v4M3 17v4h4m10 0h4v-4M6 7v10m3-10v10m3-10v10m3-10v10m3-10v10'),sort:glyph('M8 3v14m-3-3 3 3 3-3M16 21V7m-3 3 3-3 3 3'),check:glyph('m5 12 4 4 10-10')};

export class MobileFoodSearch{
 constructor({root,language,request,onScan,onPick,onClose=null,fetchPage=null,onPreferenceError=()=>{},query='',multi=null,restore=null}){
  if(restore?.multi?.ownerId!==multi?.ownerId)restore=null;query=restore?.query??query;
  Object.assign(this,{root,language,request,onScan,onPick,onClose,onPreferenceError});const preferences=readFoodSearchPreferences();this.abort=new AbortController();this.databases=[];this.filters={category:'all',sort:preferences.sort,databases:preferences.databases};this.tabs=restore?.tabs??preferences.tabs;if(restore)this.filters=structuredClone(restore.filters);this.defaults=restore?.defaults??multi?.defaults;
  this.m=(key,values)=>formatMessage(language,'mobileSearch.'+key,values);
  const b=(key,contents=symbols[key])=>`<button type="button" data-mfs="${key}" aria-label="${e(this.m(key))}">${contents}</button>`;
  root.innerHTML=`<div class="mfs-content"><header class="mfs-header">${b('close')}<div class="mfs-search">${symbols.search}<input id="food-search" type="search" autocomplete="off" placeholder="${e(this.m('search'))}" aria-label="${e(this.m('search'))}" value="${e(query)}">${b('options')}</div>${b('scan')}<nav class="mfs-tabs" ${this.tabs?'':'hidden'} aria-label="${e(this.m('tabs'))}">${categories.map(id=>`<button type="button" data-mfs-category="${id}" aria-pressed="${id===this.filters.category}">${e(this.m(id))}</button>`).join('')}</nav></header><div class="mfs-order"><span data-mfs-databases></span>${b('sort',symbols.sort+`<span data-mfs-sort>${e(this.m(this.filters.sort))}</span>`)}</div><p class="sheet-message" role="status"></p><div class="mfs-results" aria-live="polite"></div></div><div class="mfs-overlay" hidden></div>`;
  this.scrollRoot=root.closest('dialog')??root;
  this.pageObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))void this.search.next();},{root:this.scrollRoot,rootMargin:'240px'}):null;
  this.search=new CatalogSearch({append:true,fetchPage:(q,{offset,limit},signal)=>{const params=new URLSearchParams({q,category:this.filters.category,sort:this.filters.sort,offset,limit});for(const id of this.filters.databases)params.append('database',id);return fetchPage?fetchPage(params,signal):request('/api/food-search?'+params,{signal});},onChange:state=>this.render(state)});
  this.multi=multi?new FoodMultiAdd({...multi,root,language,request,defaults:this.defaults,enabled:restore?.multi?.enabled??preferences.multi,rows:restore?.multi?.rows??[],editing:restore?.multi?.editing??null,onChange:()=>{this.render(this.search.state);root.querySelector('[data-mfs=scan]').disabled=this.multi.locked();const toggle=root.querySelector('[data-mfs-multi]');if(toggle){toggle.checked=this.multi.enabled;toggle.disabled=this.multi.locked();}}}):null;
  const signal=this.abort.signal;
  root.addEventListener('click',event=>this.click(event),{signal});
  root.addEventListener('input',event=>{if(event.target.id==='food-search'){event.stopPropagation();this.setQuery(event.target.value);}},{signal});
  root.addEventListener('change',event=>{if(event.target.matches('[data-mfs-tabs]')){this.tabs=event.target.checked;root.querySelector('.mfs-tabs').hidden=!this.tabs;this.persistOptions();}if(event.target.matches('[data-mfs-multi]')){this.multi.setEnabled(event.target.checked);this.persistOptions();}},{signal});
  root.closest('dialog')?.addEventListener('cancel',event=>{if(this.open){event.preventDefault();event.stopImmediatePropagation();this.closeOptions();}},{capture:true,signal});
  root.addEventListener('keydown',event=>{
   if(this.open&&event.key==='Escape'){event.preventDefault();event.stopPropagation();this.closeOptions();return;}
   if(!this.open||event.key!=='Tab')return;
   const controls=[...root.querySelectorAll('.mfs-drawer button,.mfs-drawer input')],first=controls[0],last=controls.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  },{signal});
  root.querySelector('[data-mfs=scan]').hidden=!onScan;
  if(restore?.search)this.search.restore(restore.search);else this.search.setQuery(query,0);if(restore)this.scrollRoot.scrollTop=restore.scroll;
 }
 snapshot(){return {query:this.root.querySelector('#food-search').value,defaults:structuredClone(this.defaults),filters:structuredClone(this.filters),tabs:this.tabs,scroll:this.scrollRoot.scrollTop,search:this.search.snapshot(),multi:this.multi?.snapshot()??null};}
 persistOptions(){try{writeFoodSearchPreferences({sort:this.filters.sort,databases:this.filters.databases,tabs:this.tabs,multi:this.multi?.enabled??readFoodSearchPreferences().multi});}catch{this.onPreferenceError(this.m('preferencesError'));}}
 setQuery(query,delay=250){this.search.setQuery(query,delay);}
 render(state){
  if(this.abort.signal.aborted)return;
  this.pageObserver?.disconnect();const scroll=this.scrollRoot.scrollTop;
  const result=this.search.result;if(state.status==='ready'&&result){this.databases=result.databases;this.root.querySelector('[data-mfs-databases]').textContent=this.databases.filter(row=>this.filters.databases.includes(row.id)).map(row=>row.name).join(', ');if(this.open)this.renderOptions();}
  const button=(action,label)=>`<button type="button" data-mfs="${action}">${e(this.m(label??action))}</button>`;
  const failure=`<div class="mfs-status" role="alert">${e(state.error)}${button('retry')}</div>`;
  const target=this.root.querySelector('.mfs-results');target.setAttribute('aria-busy',String(['loading','loading-more'].includes(state.status)));
  if(state.status==='loading'){target.innerHTML=`<div class="mfs-status">${e(this.m('loading'))}</div>`;this.scrollRoot.scrollTop=0;return;}
  if(state.status==='error'){target.innerHTML=failure;return;}
  target.innerHTML=state.items.length?state.items.map(row=>{
   const source=searchSource(row,this.language),selected=this.multi?.has(row);
   return `<button type="button" class="mfs-result" data-action="${row.kind==='catalog'?'catalog-pick':'pick-food'}" data-kind="${e(row.kind)}" data-id="${e(row.id)}" ${this.multi?.enabled?`aria-pressed="${selected}"`:""}>${this.multi?.enabled?`<span class="multi-check ${selected?"checked":""}" aria-hidden="true">${selected?symbols.check:""}</span>`:""}<span class="mfs-description"><strong>${e(row.name)}</strong><span class="mfs-serving">${e(row.serving||this.m('serving'))}</span></span><span class="mfs-source ${source.className}" title="${e(source.detail)}">${e(source.label)}</span></button>`;
  }).join(''):`<div class="mfs-status">${e(this.m('empty'))}</div>`;
  if(state.status==='more-error')target.insertAdjacentHTML('beforeend',failure);
  else if(state.nextOffset!==null){
   target.insertAdjacentHTML('beforeend',`<div class="mfs-more" role="status">${state.status==='loading-more'?e(this.m('loading')):this.pageObserver?'':button('next','more')}</div>`);
   if(state.status==='ready')this.pageObserver?.observe(target.querySelector('.mfs-more'));
  }
  this.scrollRoot.scrollTop=scroll;
 }
 refresh(){this.root.querySelector('[data-mfs-sort]').textContent=this.m(this.filters.sort);this.root.querySelector('[data-mfs-databases]').textContent=this.databases.filter(row=>this.filters.databases.includes(row.id)).map(row=>row.name).join(', ');this.search.setQuery(this.root.querySelector('#food-search').value,0);}
 click(event){
  const picked=event.target.closest('.mfs-result');if(picked){event.preventDefault();event.stopPropagation();const row=this.search.state.items.find(row=>row.id===picked.dataset.id&&row.kind===picked.dataset.kind);if(row){if(this.multi?.locked())return;if(this.multi?.enabled)this.multi.toggle(row);else this.onPick(row);}return;}
  const category=event.target.closest('[data-mfs-category]');if(category){this.filters.category=category.dataset.mfsCategory;for(const tab of this.root.querySelectorAll('[data-mfs-category]'))tab.setAttribute('aria-pressed',String(tab===category));this.refresh();return;}
  const sort=event.target.closest('[data-mfs-sort-option]');if(sort){this.filters.sort=sort.dataset.mfsSortOption;this.persistOptions();this.refresh();this.closeOptions();return;}
  const database=event.target.closest('[data-mfs-database]');if(database){const id=database.dataset.mfsDatabase;this.filters.databases=!id?[]:this.filters.databases.includes(id)?this.filters.databases.filter(v=>v!==id):[...this.filters.databases,id];this.persistOptions();this.refresh();this.renderOptions();this.root.querySelector(`[data-mfs-database="${CSS.escape(id)}"]`)?.focus();return;}
  const action=event.target.closest('[data-mfs]')?.dataset.mfs;
  if(action==='options'||action==='sort'){this.openOptions(action);return;}
  if(action==='dismiss'||event.target===this.root.querySelector('.mfs-overlay')){this.closeOptions();return;}
  if(action==='close'){if(this.onClose)this.onClose();else this.root.closest('dialog')?.querySelector('[data-close]')?.click();return;}
  if(action==='scan'){if(!this.multi?.locked())this.onScan?.(this.snapshot());return;}
  if(['next','retry'].includes(action))this.search[action]();
 }
 openOptions(trigger){this.returnTarget=this.root.querySelector(`[data-mfs=${trigger}]`);this.open=true;this.root.querySelector('.mfs-content').inert=true;this.root.querySelector('.mfs-overlay').hidden=false;this.renderOptions();this.root.querySelector('.mfs-drawer button')?.focus();}
 renderOptions(){
  const overlay=this.root.querySelector('.mfs-overlay'),oldScroll=overlay.querySelector('.mfs-drawer')?.scrollTop||0,focus=document.activeElement?.dataset.mfsDatabase;
  overlay.innerHTML=`<section class="mfs-drawer" role="dialog" aria-modal="true" aria-label="${e(this.m('options'))}"><header><h2>${e(this.m('options'))}</h2><button type="button" data-mfs="dismiss" aria-label="${e(this.m('close'))}">${symbols.close}</button></header>${this.multi?`<label class="mfs-toggle">${e(this.multi.m("enable"))}<input type="checkbox" data-mfs-multi ${this.multi.enabled?"checked":""} ${this.multi.locked()?"disabled":""}></label>`:""}<label class="mfs-toggle">${e(this.m('tabs'))}<input type="checkbox" data-mfs-tabs ${this.tabs?'checked':''}></label><h3>${e(this.m('sort'))}</h3>${sorts.map(id=>`<button type="button" data-mfs-sort-option="${id}" aria-pressed="${this.filters.sort===id}">${e(this.m(id))}${this.filters.sort===id?symbols.check:''}</button>`).join('')}<h3>${e(this.m('database'))}</h3>${[{id:'',name:this.m('all')},...this.databases].map(row=>{const checked=row.id?this.filters.databases.includes(row.id):!this.filters.databases.length;return `<button type="button" data-mfs-database="${e(row.id)}" aria-pressed="${checked}">${e(row.name)}${checked?symbols.check:''}</button>`;}).join('')}</section>`;
  overlay.querySelector('.mfs-drawer').scrollTop=oldScroll;if(focus!==undefined)overlay.querySelector(`[data-mfs-database="${CSS.escape(focus)}"]`)?.focus();
 }
 closeOptions(){this.open=false;this.root.querySelector('.mfs-overlay').hidden=true;this.root.querySelector('.mfs-content').inert=false;this.returnTarget?.focus();}
 dispose(){this.pageObserver?.disconnect();this.multi?.dispose();this.search.cancel();this.abort.abort();}
}
