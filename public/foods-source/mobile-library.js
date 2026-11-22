import {mealActionText} from '../meal-action-messages.js';
import {escape as e} from './discover-ui.js';
import {formatMessage} from './message-format.js';
const message=language=>(key,values)=>formatMessage(language,'mobileLibrary.'+key,values);
const utensils='<svg viewBox="0 0 32 40" aria-hidden="true"><path fill="currentColor" d="M2 2h2v9h2V2h2v9h2V2h2v9h2V2h2v13c0 3-2 5-5 6v18H7V21c-3-1-5-3-5-6ZM20 2c6 0 10 5 10 12v11h-5v14h-5Z"/></svg>';
const apple='<svg viewBox="0 0 36 40" aria-hidden="true"><path fill="#239f54" d="M17 11C16 4 21 1 28 1c-1 6-5 10-11 10Z"/><path fill="#ef4813" d="M18 12c4-1 8-4 12-1 6 4 5 13 2 19-2 5-5 9-9 8-3-1-5-2-8 0-5 2-9-3-12-11C0 19 1 12 6 10c4-2 8 0 12 2Z"/></svg>';
const swipe='<svg class="ml-tip-swipe" viewBox="0 0 32 47" aria-hidden="true"><g stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path fill="none" d="M2 7q10-4 25-1m-3-3 3 3-3 3"/><path fill="var(--paper)" d="M5 31c-1-3 2-5 4-2l1 1 5-18c1-3 5-2 4 1l-3 12c1-2 4-2 5 1 2-2 4-1 4 2 3-2 5 0 4 3l-4 9c-2 5-5 6-10 5-5-2-7-7-10-14Z"/></g></svg>';
const bulb='<svg viewBox="0 0 40 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 1v6M8 5l3 5M2 13l5 3M32 5l-3 5M38 13l-5 3M15 35c0-6-6-7-6-15a11 11 0 0 1 22 0c0 8-6 9-6 15Zm0 3h10m-10 3h10m-9 3h8q-1 3-4 3t-4-3Zm2-10-2-13q-1-3-3-1t2 4q6 4 10-2c1-3-3-3-3-1l-1 13"/></svg>';
export function mobileLibraryHeader({tab,empty,retiredOnly,language,icon}){
 const label=key=>e(formatMessage(language,key)),kind=tab.slice(0,-1),recipes=tab==='recipes';
 const genuinelyEmpty=empty&&!retiredOnly;
 const utility=retiredOnly&&!recipes?`<button type="button" data-action="library-options" aria-label="${label('mobileLibrary.options')}">${icon('more')}</button>`:'';
 const primary=recipes?`<button type="button" data-action="library-options" aria-haspopup="dialog" aria-label="${label(genuinelyEmpty?'mobileLibrary.moreOptions':'mobileLibrary.more')}">${icon('plus')}</button>`:`<button type="button" data-action="new-${kind}" aria-label="${label('mobileFoods.create.'+kind)}">${icon('plus')}</button>`;
 return `<div class="ml-header${genuinelyEmpty||tab==='foods'&&!retiredOnly?' ml-header-compact':''}${utility?' ml-header-wide':''}" ${genuinelyEmpty?'data-empty-collection="'+tab+'"':''}><button type="button" data-action="foods-home" aria-label="${label(genuinelyEmpty?'mobileLibrary.back':'mobileFoods.back')}">${icon('back')}</button><h1>${label('mobileFoods.'+tab)}</h1><div class="ml-header-actions">${utility}${primary}</div></div>`;
}
export function mobileLibraryCollection({items,tab,query,sort,retired,showMealTip,language,icon}){
 const m=message(language),kind=tab.slice(0,-1),collator=new Intl.Collator(language,{sensitivity:'base',numeric:true});
 const empty=!retired&&items.length===0;
 const matches=items.filter(item=>item.name.toLocaleLowerCase(language).includes(query.toLocaleLowerCase(language)));
 const ordered=sort==='alphabetical'?matches.sort((a,b)=>collator.compare(a.name,b.name)):matches.reverse();
 const count=m('count.'+tab+(matches.length===1?'.one':'.other'),{count:matches.length.toLocaleString(language)});
 const search=empty&&tab==='meals'?'':`<div class="ml-search">${icon('search')}<input id="library-search" type="search" aria-label="${e(formatMessage(language,'libraryView.search'))}" placeholder="${e(m('search'))}" value="${e(query)}"></div>`;
 const symbol=tab==='foods'?apple:utensils;
 const emptyCard=`<article class="ml-empty-card"><span class="ml-empty-icon" aria-hidden="true">${symbol}</span><div><h2>${e(m('empty.'+tab))}</h2><p>${e(m('emptyHelp.'+tab))}</p></div></article>`;
 const tools=`<div class="ml-tools"><span>${e(count)}${retired?' · '+e(formatMessage(language,'libraryLifecycle.retiredItems')):''}</span><button type="button" data-action="${tab==='recipes'?'collection-sort':'library-options'}">${icon('sort')}${e(m(sort))}</button></div>`;
 const rows=ordered.map(item=>`<button type="button" class="ml-row" data-library-kind="${tab}" aria-haspopup="dialog" aria-keyshortcuts="Shift+F10" title="${e(m('more'))}" data-action="edit-${kind}" data-library-item="${e(item.id)}" data-id="${e(item.id)}"><span>${e(item.name)}</span>${icon('chevron')}</button>`).join('');
 const results=empty?emptyCard:tools+'<div class="ml-list">'+(rows||'<p class="ml-empty">'+e(formatMessage(language,'libraryView.empty.'+tab))+'</p>')+'</div>';
 const tip=showMealTip&&tab==='meals'&&!retired&&!query?`<aside class="ml-empty-card ml-meal-tip"><span class="ml-empty-icon">${bulb}</span><div><h2>${e(m('mealTip'))}</h2><p>${e(m('mealTipText'))}</p><figure class="ml-tip-example" aria-hidden="true"><div class="ml-tip-meal">${swipe}<span class="ml-tip-emblem">${utensils}</span>${e(m('exampleMeal'))}</div><div class="ml-tip-actions"><span>${e(mealActionText('adjust',{},language))}</span><span>${e(mealActionText('expand',{},language))}</span></div></figure></div><button type="button" data-action="dismiss-meal-tip" aria-label="${e(m('dismissTip'))}">×</button></aside>`:'';
 return `<section class="ml-collection" data-library-collection="${tab}">${search}<div class="ml-results">${results}${tip}</div></section>`;
}

/** A native modal sheet owns focus and dismissal without replacing the editor. */
export class MobileLibrarySheet{
 constructor({label,items,onChoose,onClose}){
  this.origin=document.activeElement;this.onClose=onClose;this.closed=false;
  const root=document.createElement('dialog');this.root=root;root.className='ml-sheet';root.setAttribute('aria-label',label);
  root.innerHTML=items.map(item=>`<button type="button" data-sheet-choice="${e(item.id)}"${item.selected===undefined?'':` aria-pressed="${item.selected}"`}>${item.icon||''}<span>${e(item.label)}</span></button>`).join('');

  root.addEventListener('cancel',event=>{event.preventDefault();this.close();});
  root.addEventListener('close',()=>this.close());
  root.addEventListener('click',event=>{
   const button=event.target.closest('[data-sheet-choice]');
   if(button){event.preventDefault();event.stopPropagation();const choice=button.dataset.sheetChoice;this.close();onChoose(choice);return;}
   if(event.target===root){const rect=root.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)this.close();}
  });
  document.body.append(root);root.showModal();root.querySelector('button')?.focus();
 }
 close(restoreFocus=true){if(this.closed)return;this.closed=true;if(this.root.open)this.root.close();this.root.remove();if(restoreFocus&&this.origin?.isConnected)this.origin.focus();this.onClose?.();}
}

/** Saved-item utilities belong to the collection, outside any unsaved editor. */
export class MobileLibraryActions {
 constructor({root,onChoose}){
  this.abort=new AbortController();const options={signal:this.abort.signal};
  const cancel=()=>{clearTimeout(this.timer);this.pending=null;};
  const rowFor=event=>event.target.closest('.ml-row');
  const open=row=>{cancel();if(!row?.isConnected||this.abort.signal.aborted)return;row.focus({preventScroll:true});onChoose(row.dataset.libraryKind,row.dataset.id);};
  root.addEventListener('contextmenu',event=>{const row=rowFor(event);if(!row)return;event.preventDefault();event.stopPropagation();if(this.suppressClick!==row)open(row);},options);
  root.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){const row=rowFor(event);if(row){event.preventDefault();event.stopPropagation();open(row);}}},options);
  root.addEventListener('pointerdown',event=>{
   cancel();this.suppressClick=null;
   const row=rowFor(event);if(!row||!event.isPrimary||!['touch','pen'].includes(event.pointerType)||event.button!==0)return;
   this.pending={id:event.pointerId,x:event.clientX,y:event.clientY};
   this.timer=setTimeout(()=>{this.suppressClick=row;open(row);},500);
  },options);
  root.addEventListener('pointermove',event=>{const start=this.pending;if(start?.id===event.pointerId&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>10)cancel();},options);
  for(const type of ['pointerup','pointercancel'])window.addEventListener(type,cancel,options);
  window.addEventListener('scroll',cancel,{...options,capture:true});window.addEventListener('blur',cancel,options);
  root.addEventListener('click',event=>{const row=rowFor(event);if(row&&event.detail&&row===this.suppressClick){event.preventDefault();event.stopImmediatePropagation();this.suppressClick=null;}}, {...options,capture:true});
 }
 dispose(){clearTimeout(this.timer);this.pending=null;this.suppressClick=null;this.abort.abort();}
}
