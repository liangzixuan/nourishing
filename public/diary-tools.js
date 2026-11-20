import {request,queueCommand} from './diary-api.js';
import {mealActionText as mealText} from './meal-action-messages.js';
import {escape as e} from './html.js';
import {t} from './app-language.js';
import {coreText} from './core-cloud-messages.js';
const key=(collection,id)=>JSON.stringify([collection,id]);
const name=(collection,row)=>collection==='notes'?row.text:collection==='biometrics'?row.type:row.facts?.name??row.name;
const button=(label,action,disabled=false)=>`<button type="button" data-diary-tool="${action}" ${disabled?'disabled':''}>${label}</button>`;
export function createDiaryTools({diary,date,show,close,header,content,render,onChange,onComplete,onReport,onShare,onMealAction,onNutrition}){
 let selecting=false,selected=new Set(),clipboard=null;
 const rows=()=>['entries','notes','biometrics'].flatMap(collection=>(diary()?.[collection]??[]).map(row=>({collection,row})));
 const selection=()=>({date:date(),scope:'selected',records:rows().filter(({collection,row})=>selected.has(key(collection,row.id))).map(({collection,row})=>({collection,id:row.id}))});
 const all=()=>({date:date(),scope:'day'});
 const refs=source=>{if(source.scope==='selected')return rows().filter(({collection,row})=>source.records.some(ref=>ref.collection===collection&&ref.id===row.id));return rows().filter(({row})=>source.scope==='day'||row.group===source.group);};
 const groupSelection=group=>({date:date(),scope:'selected',records:diary().recordDisplay.groups.find(row=>row.name===group)?.records??[]});
 function reset(){selecting=false;selected.clear();}
 async function save(type,payload,revision=diary().revision,projection={}){
  const result=await queueCommand(revision,type,payload,{projection});reset();close();void onChange();return result;
 }
 function screen(title,html){show(header(title)+'<section class="diary-tools-sheet">'+html+'<p class="sheet-message" role="status"></p></section>');}
 function actionForm(title,html,onSubmit){screen(title,'<form>'+html+`<footer class="entry-actions"><button class="primary">${e(t('common.save'))}</button></footer></form>`);const form=content.querySelector('form'),status=content.querySelector('[role=status]');form.onsubmit=async event=>{event.preventDefault();form.querySelectorAll('button').forEach(b=>b.disabled=true);try{await onSubmit(Object.fromEntries(new FormData(form)));}catch(error){if(status.isConnected)status.textContent=error.message;}finally{form.querySelectorAll('button').forEach(b=>b.disabled=false);}};return form;}
 async function busy(title,work){screen(title,`<p class="empty">${e(coreText('loading'))}</p>`);const marker=content.querySelector('.diary-tools-sheet');try{const value=await work();return marker.isConnected?value:null;}catch(error){if(marker.isConnected)marker.innerHTML='<p class="sheet-message">'+e(error.message)+'</p>';return null;}}
 function confirm(title,html,label,run){screen(title,html+`<footer class="entry-actions"><button class="primary" data-confirm>${label}</button></footer>`);const confirm=content.querySelector('[data-confirm]'),status=content.querySelector('[role=status]');confirm.onclick=async()=>{confirm.disabled=true;try{await run();}catch(error){if(status.isConnected)status.textContent=error.message;}finally{confirm.disabled=false;}};}
 async function capture(source){const result=await busy(coreText('tools.copyEntries'),()=>request('/api/diary/tools/review',{operation:'capture',selection:source}));if(!result)return;clipboard=result.selection;reset();render();close();}
 function copy(source){
  const form=actionForm(coreText('tools.copyTo'),`<label class="field-row"><span>${e(t('mobileFood.date'))}</span><input name="date" type="date" value="${e(date())}" required></label><label class="field-row"><span>${e(t('mobileFood.group'))}</span><select name="group"><option value="">${e(t('diaryCopy.keepGroups'))}</option>${diary().groups.map(g=>`<option>${e(g)}</option>`).join('')}</select></label>`,async values=>{
   const review=await request('/api/diary/tools/review',{operation:'copy',selection:source,destination:{date:values.date,group:values.group||null}});
   confirm(coreText('tools.copyEntries'),`<p class="diary-tools-summary">${e(coreText('tools.entries',{count:review.total}))} · ${e(review.destination.date)}${review.destination.group?' · '+e(review.destination.group):''}</p><ul class="diary-tools-preview">${review.items.map(item=>`<li>${e(item.name??item.detail?.text??coreText('note'))}</li>`).join('')}</ul>`, coreText('tools.copy'),()=>save('records.copy',{selection:review.selection,destination:review.destination,fingerprint:review.fingerprint,confirmed:true},review.revision));
  });form.querySelector('button').textContent=coreText('tools.continue');
 }
 async function clear(source){const review=await busy(t('diary.clearAmounts'),()=>request('/api/diary/tools/review',{operation:'clear',selection:source}));if(!review)return;confirm(t('diary.clearAmounts'),`<p class="diary-tools-summary">${e(coreText('tools.clearConfirm',{count:review.total}))}</p><ul class="diary-tools-preview">${review.examples.map(item=>`<li>${e(item.name)}</li>`).join('')}</ul>`,t('diary.clearAmounts'),()=>save('records.clear-amounts',{selection:review.selection,fingerprint:review.fingerprint,confirmed:true},review.revision));}
 function move(source){const records=refs(source).map(({collection,row})=>({collection,id:row.id,group:row.group??null})),revision=diary().revision;actionForm(coreText('tools.moveGroup'),`<label class="field-row"><span>${e(t('mobileFood.group'))}</span><select name="group">${diary().groups.map(g=>`<option>${e(g)}</option>`).join('')}</select></label>`,values=>save('records.move-group',{date:date(),group:values.group,records},revision));}
 function time(source){const records=refs(source).map(({collection,row})=>({collection,id:row.id,group:row.group??null,time:row.time??''})),revision=diary().revision;actionForm(t('diaryActions.time.set'),`<label class="field-row"><span>${e(t('appActions.time'))}</span><input name="time" type="time"></label>`,values=>save('records.set-time',{date:date(),time:values.time,records},revision));}
 function remove(source){const records=refs(source),revision=diary().revision;confirm(coreText('tools.deleteEntries'),`<p class="diary-tools-summary">${e(coreText('tools.deleteConfirm',{count:records.length}))}</p>`,t('mobileRepeat.delete'),()=>save('records.delete',{selection:source,confirmed:true},revision));}
 async function reusable(source,kind){
  const title=t('diaryActions.selection.'+kind),review=await busy(title,()=>request('/api/diary/tools/review',{operation:kind,selection:source}));if(!review)return;
  actionForm(title,`<label class="field-row"><span>${e(t('settings.name'))}</span><input name="name" maxlength="500" value="${e(review.name)}" required></label><ul class="diary-tools-preview">${review.items.map(item=>`<li>${e(item.name)}<small>${e(item.quantity??item.amount)} ${e(item.unit??coreText('diary.portions'))}</small></li>`).join('')}</ul>`,values=>save('selection.'+kind,{selection:review.selection,fingerprint:review.fingerprint,name:values.name,confirmed:true},review.revision,{reusable:{kind,resource:review.resource,foods:review.foods}}));
 }

 function order(group){const current=group===undefined?diary().diarySort:diary().groupOrders[group]??'',revision=diary().revision;actionForm(group===undefined?t('diaryGroups.entryOrder'):coreText('tools.groupOrder',{group}),`<label class="field-row"><span>${e(t('diaryGroups.order'))}</span><select name="mode">${[...(group===undefined?[]:[['',coreText('tools.diaryDefault')]]),['source',t('health.count.added')],['time',t('appActions.time')]].map(([value,label])=>`<option value="${value}" ${value===current?'selected':''}>${label}</option>`).join('')}</select></label>`,values=>save(group===undefined?'diary.order':'group.order',group===undefined?{mode:values.mode}:{group,mode:values.mode||null},revision));}
 function select(source){selecting=true;selected=new Set(refs(source).map(({collection,row})=>key(collection,row.id)));close();render();}
 const actions={copy:capture,paste:copy,clear,move,time,meal:source=>reusable(source,'meal'),recipe:source=>reusable(source,'recipe'),nutrition:source=>onNutrition(source),delete:remove};
 function menuSheet(label,items,choose){
  show(`<section class="diary-menu-sheet" aria-label="${e(label)}"><h2 id="sheet-title" class="diary-menu-title">${e(label)}</h2>${items.map(item=>button(e(item.label),item.id,item.disabled)).join('')}<p role="status" class="sheet-message"></p></section>`);
  const root=content.querySelector('.diary-menu-sheet');
  root.querySelectorAll('[data-diary-tool]').forEach(node=>node.onclick=async()=>{node.disabled=true;try{await choose(node.dataset.diaryTool);}catch(error){if(root.isConnected)root.querySelector('[role=status]').textContent=error.message;}finally{node.disabled=false;}});
 }
 async function copyPreviousDay(){
  const destination={date:date(),group:null},previous=new Date(date()+'T12:00:00Z');previous.setUTCDate(previous.getUTCDate()-1);
  const review=await busy(coreText('diary.copyPreviousDay'),()=>request('/api/diary/tools/review',{operation:'copy',selection:{date:previous.toISOString().slice(0,10),scope:'day'},destination}));if(!review)return;
  return save('records.copy',{selection:review.selection,destination:review.destination,fingerprint:review.fingerprint,confirmed:true},review.revision);
 }
 function menu(){
  if(selecting)return selectionMenu();
  const items=[
   {id:'complete',label:diary().completed?t('diary.reopen'):coreText('diary.completeDay')},
   {id:'report',label:coreText('diary.dailyReport')},
   {id:'share',label:coreText('diary.shareWidgets')},
   {id:'sort-all',label:coreText('diary.sortAll')},
   {id:'select',label:coreText('diary.multiSelectAction')},
   ...(clipboard?[{id:'paste',label:t('mobileCompositeEditor.paste')}]:[]),
   {id:'copy',label:coreText('diary.copyCurrentDay')},
   {id:'copy-previous',label:coreText('diary.copyPreviousDay')},
   {id:'clear',label:coreText('diary.clearAllAmounts')},
   {id:'delete',label:coreText('diary.deleteAll')}
  ];
  menuSheet(t('nav.diary'),items,async action=>{
   if(action==='select'){selecting=true;selected.clear();close();render();}
   else if(action==='complete'){await onComplete();close();}
   else if(action==='report'){close();onReport();}
   else if(action==='share')onShare();
   else if(action==='sort-all')await save('diary.sort-all',{});
   else if(action==='copy-previous')await copyPreviousDay();
   else if(action==='paste')copy(clipboard);
   else await actions[action](all());
  });
 }

 function selectionMenu(){
  const source=selection(),records=refs(source),count=records.length,foods=records.filter(({collection,row})=>collection==='entries'&&row.kind!=='exercise'),foodOnly=!!count&&foods.length===count;
  const items=[
   {id:'time',label:coreText('diary.selectedTime'),disabled:!foodOnly},
   {id:'recipe',label:coreText('diary.selectedRecipe'),disabled:!foodOnly},
   {id:'meal',label:coreText('diary.selectedMeal'),disabled:!foodOnly},
   {id:'copy',label:coreText('tools.copy'),disabled:!count},
   {id:'nutrition',label:coreText('diary.selectedNutrition'),disabled:!foods.length},
   {id:'delete',label:t('mobileRepeat.delete'),disabled:!count}
  ];
  menuSheet(coreText('diary.selectedActions'),items,action=>actions[action](source));
 }

 function groupMenu(group){const source=groupSelection(group),configured=diary().groups.includes(group);screen(group,`<div class="diary-tools-menu">${button(coreText('tools.selectGroup'),'select')}${button(t('diaryCopy.copyGroup'),'copy')}${button(t('diary.clearAmounts'),'clear')}${configured?button(t('diaryGroups.entryOrder'),'order'):''}</div>`);content.querySelectorAll('[data-diary-tool]').forEach(b=>b.onclick=()=>{const action=b.dataset.diaryTool;if(action==='select')select(source);else if(action==='order')order(group);else actions[action](source);});}
 async function expand(entry){
  const review=await busy(mealText('expand'),()=>request('/api/diary/tools/review',{operation:'expand',date:entry.date,id:entry.id}));if(!review)return;
  try{await save('entry.expand',{date:review.date,id:review.id,fingerprint:review.fingerprint,confirmed:true},review.revision,{entries:review.items});}
  catch(error){const status=content.querySelector('[role=status]');if(status)status.textContent=error.message;}
 }
 async function mealSettings(){
  const view=await busy(mealText('settings'),()=>request('/api/display'));if(!view)return;
  const form=actionForm(mealText('settings'),`<label class="field-row"><span>${e(t('mobileDisplay.alwaysExpandMeals'))}</span><input type="checkbox" role="switch" name="alwaysExpandMeals" ${view.settings.alwaysExpandMeals?'checked':''}></label>`,()=>save('display.save',{alwaysExpandMeals:form.elements.alwaysExpandMeals.checked},view.revision));
 }
 function recordMenu(collection,id,onEdit){
  const source={date:date(),scope:'selected',records:[{collection,id}]},entry=collection==='entries'?diary().entries.find(row=>row.id===id):null,isMeal=!!entry?.mealId;
  const mealActions=[['repeat','repeat'],['original','original'],['copyEdit','copy-edit'],['adjust','adjust'],['expand','expand'],['settings','settings']];
  screen(isMeal?entry.facts?.name??entry.name??coreText('tools.entry'):coreText('tools.entry'),`<div class="diary-tools-menu">${isMeal?mealActions.map(([label,action])=>button(e(mealText(label)),action)).join(''):button(t('mobileNutrientTargets.edit'),'edit')+button(t('cyclePanel.select'),'select')}${button(coreText('tools.copy'),'copy')}${isMeal?button(e(mealText('nutrition')),'nutrition'):button(coreText('tools.moveGroup'),'move')}${button(t('mobileRepeat.delete'),'delete')}</div>`);
  content.querySelectorAll('[data-diary-tool]').forEach(b=>b.onclick=()=>{const action=b.dataset.diaryTool;if(action==='edit')onEdit();else if(action==='select')select(source);else if(isMeal&&action==='expand')void expand(entry);else if(isMeal&&action==='settings')void mealSettings();else if(isMeal&&['repeat','original','copy-edit','adjust','nutrition'].includes(action))onMealAction?.(action,entry);else actions[action](source);});
 }
 return {
  menu,groupMenu,recordMenu,reset,selection:()=>selecting?selection():null,
  selectBox(collection,row){return selecting?`<input type="checkbox" class="diary-select" data-tool-select data-collection="${collection}" data-id="${e(row.id)}" aria-label="${e(coreText('tools.selectName',{name:name(collection,row)}))}" ${selected.has(key(collection,row.id))?'checked':''}>`:'';},
  groupBox(group){const members=refs(groupSelection(group));return selecting?`<input type="checkbox" class="diary-select" data-tool-select-group="${e(group)}" aria-label="${e(coreText('tools.selectName',{name:group}))}" ${!members.length?'disabled':members.every(({collection,row})=>selected.has(key(collection,row.id)))?'checked':''}>`:'';},
  selectionHeader(icons){return selecting?`<div class="diary-selection-header"><button type="button" class="icon-button" data-diary-tool="done" aria-label="${e(t('mobileFoodEditor.back'))}">${icons.back}</button><h2>${e(coreText('diary.multiSelect'))}</h2><button type="button" class="icon-button" data-diary-menu aria-label="${e(coreText('diary.selectedActions'))}">${icons.more}</button></div>`:'';},
  toggleRow(target){if(!selecting||target.closest('input'))return false;const row=target.closest('[data-diary-record]');if(!row)return false;const k=key(row.dataset.collection,row.dataset.id);selected.has(k)?selected.delete(k):selected.add(k);render();return true;},
  change(event){const input=event.target;if(input.hasAttribute('data-tool-select')){const k=key(input.dataset.collection,input.dataset.id);input.checked?selected.add(k):selected.delete(k);render();return true;}if(input.hasAttribute('data-tool-select-group')){for(const {collection,row}of refs(groupSelection(input.dataset.toolSelectGroup))){const k=key(collection,row.id);input.checked?selected.add(k):selected.delete(k);}render();return true;}return false;},
  action(action){if(action==='done'){reset();render();return;}actions[action]?.(selection());},
  dispose(){reset();clipboard=null;}
 };
}
