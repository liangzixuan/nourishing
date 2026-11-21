import {FoodMultiRecovery} from '../food-multi-recovery.js';
import {formatMessage} from './message-format.js';
import {escape as e} from '../html.js';
import {searchSource} from './mobile-food-search-row.js';

const mode='food-multi-add',sessions=new Map();
const key=row=>JSON.stringify([row.kind,row.id]);
export class FoodMultiAdd{
 constructor({root,language,request,defaults,onEdit,onSaved,onQueue,onReview,onChange,ownerId,enabled=false,rows=[],editing=null}){
  Object.assign(this,{root,language,request,defaults,onEdit,onSaved,onQueue,onReview,onChange,ownerId});if(!ownerId)throw Error('Sign in to use Multi-Add.');if(!sessions.has(ownerId))sessions.set(ownerId,{pending:null,saving:false,panel:null});this.session=sessions.get(ownerId);this.selected=new Map(structuredClone(rows).map(row=>[key(row.selection),row]));this.enabled=enabled;this.editing=editing;this.loading=true;this.version=0;this.abort=new AbortController();this.recovery=new FoodMultiRecovery(ownerId);this.records=[];this.destination={kind:'diary'};this.session.panel=this;
  this.m=(k,v)=>formatMessage(language,'multiAdd.'+k,v);this.bar=document.createElement('div');this.bar.className='multi-bar';root.querySelector('.mfs-content').append(this.bar);this.overlay=document.createElement('div');this.overlay.className='multi-overlay';this.overlay.hidden=true;root.append(this.overlay);
  root.addEventListener('click',event=>{const action=event.target.closest('[data-multi]');if(action){event.preventDefault();event.stopPropagation();void this.action(action.dataset.multi,action.dataset.id);}else if(event.target===this.overlay)this.hide();},{signal:this.abort.signal});
  this.overlay.addEventListener('input',event=>{if(this.locked())return;if(event.target.matches('[data-multi-name],[data-multi-servings]')){this.destination={kind:'recipe',name:this.overlay.querySelector('[data-multi-name]').value.trim(),servings:Number(this.overlay.querySelector('[data-multi-servings]').value)};this.schedule();}},{signal:this.abort.signal});
  root.closest('dialog')?.addEventListener('cancel',event=>{if(this.open){event.preventDefault();event.stopImmediatePropagation();this.hide();}},{capture:true,signal:this.abort.signal});
  document.addEventListener('keydown',event=>{if(this.open&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();this.hide();}},{capture:true,signal:this.abort.signal});
  this.overlay.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const controls=[...this.overlay.querySelectorAll('button:not(:disabled),input:not(:disabled)')],first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}},{signal:this.abort.signal});
  this.renderBar();this.ready=this.loadRecovery();
 }
 snapshot(){return {ownerId:this.ownerId,enabled:this.enabled,editing:this.editing,rows:structuredClone([...this.selected.values()])};}
 locked(){return this.loading||this.opening||this.session.saving||Boolean(this.session.pending)||Boolean(this.records.length)||Boolean(this.recoveryError);}
 setEnabled(value){if(this.locked())return;this.enabled=value;this.renderBar();this.onChange();}
 has(row){return this.selected.has(key(row));}
 toggle(row){
  if(this.locked())return;const id=key(row);
  if(this.selected.has(id))this.selected.delete(id);else this.selected.set(id,{id:crypto.randomUUID(),selection:{kind:row.kind,id:row.id},entry:{...this.defaults,amount:1},display:structuredClone(row)});
  this.review=null;this.renderBar();this.onChange();
 }
 select(row,entry){if(this.locked())return false;row={...row,sourceType:row.sourceType??'custom'};const id=key(row);if(!this.selected.has(id))this.selected.set(id,{id:crypto.randomUUID(),selection:{kind:row.kind,id:row.id},entry:{...this.defaults,amount:1},display:structuredClone(row)});if(entry){this.editing=this.selected.get(id).id;this.applyEntry(entry);this.editing=null;}this.enabled=true;this.review=null;this.renderBar();this.onChange();return true;}
 renderBar(){const recover=Boolean(this.session.pending||this.records.length||this.recoveryError);this.bar.hidden=!this.enabled&&!recover;this.bar.innerHTML=`<button type="button" data-multi="${recover?'recover':'review'}" ${!recover&&!this.selected.size?'disabled':''}>${e(recover?this.m('recover'):this.m('review',{count:this.selected.size}))}</button>`;}
 async loadRecovery(){
  this.loading=true;
  try{this.records=await this.recovery.list();this.recoveryError='';if(this.disposed)return;if(this.session.pending&&!this.records.some(row=>row.id===this.session.pending.payload.requestId))this.records.push({ownerId:this.ownerId,id:this.session.pending.payload.requestId,mode,packet:this.session.pending});if(this.records.length){this.enabled=true;if(this.records.length===1)this.restore(this.records[0].id);else this.showRecovery();}}
  catch{this.recoveryError=this.m('recoveryError');if(!this.disposed)this.showRecovery();}
  finally{this.loading=false;if(!this.disposed){this.renderBar();if(this.session.pending)this.render();this.onChange();}}
 }
 showRecovery(){this.show();this.overlay.innerHTML=`<section class="multi-sheet"><header><h2>${e(this.m('title'))}</h2>${this.button('close','×')}</header><div role="alert">${e(this.recoveryError||'')}</div>${this.records.map(record=>this.button('restore',e(this.m('recover')),`data-id="${e(record.id)}"`)).join('')}${this.recoveryError?this.button('recover',e(this.m('retry'))):''}</section>`;}
 restore(id){
  const record=this.records.find(row=>row.id===id),pending=record?.packet;
  if(!pending||record.ownerId!==this.ownerId||pending.ownerId!==this.ownerId||pending.mode!==mode||pending.body!==JSON.stringify(pending.payload)||pending.payload?.requestId!==record.id||!Array.isArray(pending.data?.rows)){this.recoveryError=this.m('invalidRecovery');this.showRecovery();return;}
  if(this.session.pending?.payload.requestId!==record.id)this.session.pending=structuredClone(pending);this.selected=new Map(pending.data.rows.map(row=>[key(row.display),row]));this.destination=structuredClone(pending.payload.payload.destination);this.review=structuredClone(pending.review);this.error=this.m('unknown');this.show();this.render();
 }
 button(action,label,extra=''){return `<button type="button" data-multi="${action}" ${extra}>${label}</button>`;}
 show(){this.open=true;this.overlay.hidden=false;this.root.querySelector('.mfs-content').inert=true;}
 hide(){this.open=false;this.overlay.hidden=true;this.root.querySelector('.mfs-content').inert=false;this.bar.querySelector('button')?.focus();}
 payload(){return {destination:structuredClone(this.destination),rows:[...this.selected.values()].map(({id,selection,entry})=>({id,selection:structuredClone(selection),entry:structuredClone(entry)}))};}
 quantity(row){if(row.quantityLabel)return row.quantityLabel;if(row.entry.quantity!==undefined)return `${row.entry.quantity} ${row.entry.unit==='portion'?'portion(s)':row.entry.unit}`;return row.display.serving?(row.entry.amount===1?row.display.serving:`${row.entry.amount} × ${row.display.serving}`):this.m('serving',{amount:row.entry.amount});}
 render(){
  if(!this.open||this.disposed)return;const pending=Boolean(this.session.pending),busy=this.checking||this.session.saving,recipe=this.destination.kind==='recipe';
  this.overlay.innerHTML=`<section class="multi-sheet" role="dialog" aria-modal="true" aria-label="${e(this.m('title'))}" aria-busy="${Boolean(busy)}"><header><h2>${e(this.m('title'))}</h2>${this.button('close','×',`aria-label="${e(this.m('close'))}"`)}</header>${recipe?`<div class="multi-recipe"><label>${e(this.m('name'))}<input data-multi-name value="${e(this.destination.name)}" ${pending?'disabled':''}></label><label>${e(this.m('servings'))}<input data-multi-servings type="number" min="0.001" step="any" value="${e(this.destination.servings)}" ${pending?'disabled':''}></label></div>`:''}<div class="multi-items">${[...this.selected.values()].map(row=>{const source=searchSource(row.display,this.language);return `<div class="multi-row">${this.button('remove','✓',`data-id="${e(row.id)}" aria-label="${e(this.m('remove',{name:row.display.name}))}" ${pending?'disabled':''}`)}${this.button('edit',`<strong>${e(row.display.name)}</strong><span>${e(this.quantity(row))}</span>`,`data-id="${e(row.id)}" aria-label="${e(this.m('edit',{name:row.display.name}))}" ${pending?'disabled':''}`)}<span class="mfs-source ${source.className}">${e(source.label)}</span></div>`;}).join('')}</div><div class="multi-status" role="status">${e(this.error||(!this.selected.size?this.m('empty'):busy?this.m(this.session.saving?'saving':'checking'):''))}</div><footer>${!pending&&this.error?this.button('preview','Try again'):''}${pending?`${this.button('discard',e(this.m('discard')),this.session.saving?'disabled':'')}${this.button('retry',e(this.m('retry')),this.session.saving?'disabled':'')}`:`${this.button(recipe?'back':'recipe',e(this.m(recipe?'back':'recipe')),!this.selected.size||busy?'disabled':'')}${this.button('save',e(this.m(recipe?'recipe':'diary')),!this.review||busy?'disabled':'')}`}</footer></section>`;
  queueMicrotask(()=>{if(!this.disposed&&this.open&&!this.overlay.contains(document.activeElement))this.overlay.querySelector('button:not(:disabled)')?.focus();});
 }
 schedule(delay=180){
  if(this.session.pending||this.disposed)return;clearTimeout(this.timer);this.controller?.abort();this.version++;this.review=null;this.checking=true;this.error='';
  // Do not replace fields while the user types a recipe name or yield.
  const sheet=this.overlay.querySelector('.multi-sheet');if(sheet){sheet.setAttribute('aria-busy','true');sheet.querySelector('[data-multi=save]')?.setAttribute('disabled','');}
  // Incomplete form fields are not a server preview. Leave them editable without
  // showing a validation error before the user has supplied a name and yield.
  const incomplete=this.destination.kind==='recipe'&&(!this.destination.name.trim()||!Number.isFinite(this.destination.servings)||this.destination.servings<=0);
  if(sheet)sheet.querySelector('.multi-status').textContent='';
  if(incomplete){this.checking=false;sheet?.setAttribute('aria-busy','false');return;}
  const version=this.version;this.timer=setTimeout(()=>this.preview(version),delay);
 }
 async preview(version){
  if(this.disposed||version!==this.version)return;this.controller=new AbortController();
  try{const input=this.payload(),review=this.onReview?await this.onReview(input,this.controller.signal):await this.request('/api/food-search/preview',{method:'POST',body:JSON.stringify(input),signal:this.controller.signal});if(this.disposed||version!==this.version)return;if(typeof review.revision!=='string'||typeof review.reviewToken!=='string'||!review.reviewToken)throw Error('Review unavailable. Try again.');this.review={input,result:review};this.error='';}
  catch(error){if(this.disposed||version!==this.version||error.name==='AbortError')return;this.error=error.message;}
  finally{if(!this.disposed&&version===this.version){this.checking=false;const active=document.activeElement,field=active?.matches('[data-multi-name]')?'[data-multi-name]':active?.matches('[data-multi-servings]')?'[data-multi-servings]':null,position=active?.selectionStart;this.render();if(field){const next=this.overlay.querySelector(field);next?.focus();if(field==='[data-multi-name]'&&position!==null)next?.setSelectionRange(position,position);}}}
 }
 async action(action,id){
  if(action==='close'){this.hide();return;}if(action==='preview'){this.schedule(0);return;}if(action==='recover'){await this.loadRecovery();return;}if(action==='restore'){this.restore(id);return;}if(action==='retry'){await this.save(true);return;}
  if(action==='discard'){if(this.session.saving||!this.session.pending||!confirm(this.m('discardConfirm')))return;try{await this.recovery.remove(this.session.pending.payload.requestId);this.session.pending=null;this.review=null;this.error='';await this.loadRecovery();if(!this.records.length){this.render();this.schedule(0);}}catch(error){this.error=error.message;this.render();}return;}
  if(this.locked())return;
  if(action==='review'){this.destination={kind:'diary'};this.show();this.render();this.schedule(0);return;}
  if(action==='remove'){for(const [key,row]of this.selected)if(row.id===id)this.selected.delete(key);this.onChange();this.renderBar();this.render();this.schedule(0);return;}
  if(action==='edit'){const row=[...this.selected.values()].find(row=>row.id===id);if(!row)return;this.editing=id;this.opening=true;this.hide();try{await this.onEdit(structuredClone(row));}catch(error){if(!this.disposed){this.error=error.message;this.editing=null;this.show();this.render();}}finally{this.opening=false;}return;}
  if(action==='recipe'||action==='back'){this.destination=action==='recipe'?{kind:'recipe',name:'',servings:1}:{kind:'diary'};this.show();this.render();this.schedule(0);return;}
  if(action==='save')await this.save(false);
 }
 applyEntry(entry,quantityLabel){if(this.locked()||!this.editing)return false;const row=[...this.selected.values()].find(row=>row.id===this.editing);if(!row)return false;row.entry=Object.fromEntries(['date','group','time','amount','quantity','unit','portionId'].filter(key=>Object.hasOwn(entry,key)).map(key=>[key,entry[key]]));row.quantityLabel=quantityLabel;return true;}
 returnFromDetail(){if(!this.editing)return;this.editing=null;this.show();this.render();this.schedule(0);}
 async save(retry){
  if(this.disposed||this.session.saving||this.loading)return;
  if(!retry&&this.onQueue){
   if(this.locked()||!this.review||this.checking)return;
   this.session.saving=true;this.render();
   try{
    const result=await this.onQueue(this.review,crypto.randomUUID());
    this.selected.clear();this.review=null;
    if(!this.disposed){this.hide();try{await this.onSaved(result);}catch{this.error=this.m('savedReload');}}
   }catch(error){if(!this.disposed)this.error=error.message;}
   finally{this.session.saving=false;if(!this.disposed){this.renderBar();this.render();this.onChange();}}
   return;
  }
  if(!retry){if(this.locked()||!this.review||this.checking)return;const {input,result}=this.review,payload={requestId:crypto.randomUUID(),revision:result.revision,type:'food.multi.add',payload:{...structuredClone(input),reviewToken:result.reviewToken,confirmed:true}};this.session.pending={ownerId:this.ownerId,mode,payload,body:JSON.stringify(payload),review:structuredClone(this.review),data:{rows:structuredClone([...this.selected.values()])}};}
  const pending=this.session.pending;if(!pending)return;this.session.saving=true;this.error='';this.render();let persisted=false,saved=null;
  try{
   await this.recovery.put(pending);persisted=true;if(this.disposed)return;
   const result=await this.request('/api/workspace/command',{method:'POST',body:pending.body,signal:AbortSignal.timeout(30000)});
   if(result.ok!==true||typeof result.revision!=='string'||(pending.payload.payload.destination.kind==='diary'?(!Array.isArray(result.entryIds)||!result.entryIds.length||result.entryIds.some(id=>typeof id!=='string'||!id.trim())||new Set(result.entryIds).size!==result.entryIds.length):result.item?.kind!=='recipe'||!result.item.id))throw Error(this.m('unknown'));
   await this.recovery.remove(pending.payload.requestId);if(this.session.pending===pending)this.session.pending=null;this.records=this.records.filter(row=>row.id!==pending.payload.requestId);this.selected.clear();this.review=null;saved=result;
  }catch(error){
   if(!persisted){if(this.session.pending===pending)this.session.pending=null;this.error=this.m('unsent',{error:error.message});}
   else if(error.status>=400&&error.status<500&&![401,403,408,429].includes(error.status)){try{await this.recovery.remove(pending.payload.requestId);if(this.session.pending===pending)this.session.pending=null;this.records=this.records.filter(row=>row.id!==pending.payload.requestId);}catch{}this.review=null;this.error=error.message;}
   else this.error=this.m('unknown');
  }finally{this.session.saving=false;if(!this.disposed){this.renderBar();this.render();this.onChange();}const active=this.session.panel;if(active&&active!==this&&!active.disposed&&!saved)void active.loadRecovery();}
  if(saved){const active=this.session.panel;if(active&&!active.disposed){active.selected.clear();active.records=active.records.filter(row=>row.id!==pending.payload.requestId);active.review=null;active.renderBar();active.render();try{await active.onSaved(saved);}catch{active.error=active.m('savedReload');active.render();}}}
 }
 dispose(){this.disposed=true;this.version++;clearTimeout(this.timer);this.controller?.abort();this.abort.abort();if(this.session.panel===this)this.session.panel=null;}
}
