import {escape as e} from './discover-ui.js';
import {formatMessage} from './message-format.js';
const message=language=>(key,values)=>formatMessage(language,'mobileLibrary.'+key,values);
export function mobileLibraryHeader({tab,language,icon}){
 const kind=tab.slice(0,-1);
 return `<div class="ml-header"><button type="button" data-action="foods-home" aria-label="${e(formatMessage(language,'mobileFoods.back'))}">${icon('back')}</button><h1>${e(formatMessage(language,'mobileFoods.'+tab))}</h1><button type="button" data-action="new-${kind}" aria-label="${e(formatMessage(language,'mobileFoods.create.'+kind))}">${icon('plus')}</button></div>`;
}
export function mobileLibraryCollection({items,tab,query,sort,retired,language,icon}){
 const m=message(language),kind=tab.slice(0,-1),collator=new Intl.Collator(language,{sensitivity:'base',numeric:true});
 const ordered=sort==='alphabetical'?[...items].sort((a,b)=>collator.compare(a.name,b.name)):[...items].reverse();
 const count=m('count.'+tab+(items.length===1?'.one':'.other'),{count:items.length.toLocaleString(language)});
 return `<section class="ml-collection"><div class="ml-search">${icon('search')}<input id="library-search" type="search" aria-label="${e(formatMessage(language,'libraryView.search'))}" placeholder="${e(m('search'))}" value="${e(query)}"></div><div class="ml-tools"><span>${e(count)}${retired?' · '+e(formatMessage(language,'libraryLifecycle.retiredItems')):''}</span><button type="button" data-action="library-options">${e(m(sort))}</button></div><div class="ml-list">${ordered.map(item=>`<button type="button" class="ml-row" data-library-kind="${tab}" aria-haspopup="dialog" aria-keyshortcuts="Shift+F10" title="${e(m('more'))}" data-action="edit-${kind}" data-id="${e(item.id)}"><span>${e(item.name)}</span>${icon('chevron')}</button>`).join('')||`<p class="ml-empty">${e(formatMessage(language,'libraryView.empty.'+tab))}</p>`}</div></section>`;
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
