import {mountRecipeEditor} from './recipe-editor.js';
import {mountMealEditor} from './composite-editor.js';
import {localWorkspaceState,localLibraryView} from './local-engine.js';
import {createDisplayView,projectLocalDiary} from './local-diary-projection.js';
import {prepareLocalDiaryReview} from './diary-preparation.js';
import {request,queueCommand} from './diary-api.js';
import {mealActionText as mealText} from './meal-action-messages.js';
import {escape as e} from './html.js';
import {t,uiLanguage} from './app-language.js';
import {bottomNavigation} from './dashboard-source/discover-ui.js';
import {coreText} from './core-cloud-messages.js';
const key=(collection,id)=>JSON.stringify([collection,id]);
const name=(collection,row)=>collection==='notes'?row.text:collection==='biometrics'?row.type:row.facts?.name??row.name;
const groupIcons={time:'/shell-source/navigation/plus.svg',sort:'/diary-action-icons/sort.svg',previous:'/diary-action-icons/content-copy.svg',recipe:'/diary-action-icons/plus-circle-outline.svg',meal:'/diary-action-icons/plus-circle-outline.svg',quickAdd:'/diary-action-icons/pencil.svg',copy:'/diary-action-icons/content-copy.svg',paste:'/diary-action-icons/content-paste.svg',nutrition:'/diary-action-icons/format-list-bulleted.svg',delete:'/repeat-source/delete.svg'};
const button=(label,action,disabled=false)=>`<button type="button" data-diary-tool="${action}" ${disabled?'disabled':''}>${label}</button>`;
export function createDiaryTools({diary,date,show,close,header,content,render,onChange,onComplete,onReport,onShare,onMealAction,onNutrition,openEntry}){
 let selecting=false,selected=new Set(),clipboard=null;
 const prepare=(input,options)=>prepareLocalDiaryReview(input,diary().revision,options);
 const rows=()=>['entries','notes','biometrics'].flatMap(collection=>(diary()?.[collection]??[]).map(row=>({collection,row})));
 const selection=()=>({date:date(),scope:'selected',records:rows().filter(({collection,row})=>selected.has(key(collection,row.id))).map(({collection,row})=>({collection,id:row.id}))});
 const all=()=>({date:date(),scope:'day'});
 const refs=source=>{if(source.scope==='selected')return rows().filter(({collection,row})=>source.records.some(ref=>ref.collection===collection&&ref.id===row.id));return rows().filter(({row})=>source.scope==='day'||row.group===source.group);};
 const groupSelection=(group,view=diary(),day=date())=>({date:day,scope:'selected',records:view.recordDisplay.groups.find(row=>row.name===group)?.records??[]});
 function reset(){selecting=false;selected.clear();}
 async function save(type,payload,revision=diary().revision,projection={}){
  const result=await queueCommand(revision,type,payload,{projection});reset();close();void onChange();return result;
 }
 function screen(title,html){show(header(title)+'<section class="diary-tools-sheet">'+html+'<p class="sheet-message" role="status"></p></section>');}
 function actionForm(title,html,onSubmit){screen(title,'<form>'+html+`<footer class="entry-actions"><button class="primary">${e(t('common.save'))}</button></footer></form>`);const form=content.querySelector('form'),status=content.querySelector('[role=status]');form.onsubmit=async event=>{event.preventDefault();form.querySelectorAll('button').forEach(b=>b.disabled=true);try{await onSubmit(Object.fromEntries(new FormData(form)));}catch(error){if(status.isConnected)status.textContent=error.message;}finally{form.querySelectorAll('button').forEach(b=>b.disabled=false);}};return form;}
 async function busy(title,work){screen(title,`<p class="empty">${e(coreText('loading'))}</p>`);const marker=content.querySelector('.diary-tools-sheet');try{const value=await work();return marker.isConnected?value:null;}catch(error){if(marker.isConnected)marker.innerHTML='<p class="sheet-message">'+e(error.message)+'</p>';return null;}}
 function confirm(title,html,label,run){screen(title,html+`<footer class="entry-actions"><button class="primary" data-confirm>${label}</button></footer>`);const confirm=content.querySelector('[data-confirm]'),status=content.querySelector('[role=status]');confirm.onclick=async()=>{confirm.disabled=true;try{await run();}catch(error){if(status.isConnected)status.textContent=error.message;}finally{confirm.disabled=false;}};}
 async function capture(source){const result=await busy(coreText('tools.copyEntries'),()=>prepare({operation:'capture',selection:source}));if(!result)return;clipboard=result;reset();render();close();}
 function copy(reference,destinationGroup){
  const source=reference.selection??reference,captured=reference.localReview;
  const form=actionForm(coreText('tools.copyTo'),`<label class="field-row"><span>${e(t('mobileFood.date'))}</span><input name="date" type="date" value="${e(date())}" required></label><label class="field-row"><span>${e(t('mobileFood.group'))}</span><select name="group"><option value="">${e(t('diaryCopy.keepGroups'))}</option>${diary().groups.map(g=>`<option ${g===destinationGroup?'selected':''}>${e(g)}</option>`).join('')}</select></label>`,async values=>{
   const review=await prepare({operation:'copy',selection:source,destination:{date:values.date,group:values.group||null}},{captured});
   confirm(coreText('tools.copyEntries'),`<p class="diary-tools-summary">${e(coreText('tools.entries',{count:review.total}))} · ${e(review.destination.date)}${review.destination.group?' · '+e(review.destination.group):''}</p><ul class="diary-tools-preview">${review.items.map(item=>`<li>${e(item.name??item.detail?.text??coreText('note'))}</li>`).join('')}</ul>`, coreText('tools.copy'),()=>save('records.copy',{selection:review.selection,destination:review.destination,fingerprint:review.fingerprint,confirmed:true},review.revision,{diaryReview:review.localReview}));
  });form.querySelector('button').textContent=coreText('tools.continue');
 }
 async function clear(source){const review=await busy(t('diary.clearAmounts'),()=>prepare({operation:'clear',selection:source}));if(!review)return;confirm(t('diary.clearAmounts'),`<p class="diary-tools-summary">${e(coreText('tools.clearConfirm',{count:review.total}))}</p><ul class="diary-tools-preview">${review.examples.map(item=>`<li>${e(item.name)}</li>`).join('')}</ul>`,t('diary.clearAmounts'),()=>save('records.clear-amounts',{selection:review.selection,fingerprint:review.fingerprint,confirmed:true},review.revision,{diaryReview:review.localReview}));}
 function move(source){const records=refs(source).map(({collection,row})=>({collection,id:row.id,group:row.group??null})),revision=diary().revision;actionForm(coreText('tools.moveGroup'),`<label class="field-row"><span>${e(t('mobileFood.group'))}</span><select name="group">${diary().groups.map(g=>`<option>${e(g)}</option>`).join('')}</select></label>`,values=>save('records.move-group',{date:date(),group:values.group,records},revision));}
 function time(source,title=t('diaryActions.time.set')){const records=refs(source).map(({collection,row})=>({collection,id:row.id,group:row.group??null,time:row.time??''})),revision=diary().revision;actionForm(title,`<label class="field-row"><span>${e(t('appActions.time'))}</span><input name="time" type="time"></label>`,values=>save('records.set-time',{date:date(),time:values.time,records},revision));}
 function remove(source){
  const count=refs(source).length,revision=diary().revision;
  const day=source.scope==='day';
  const title=coreText(day?'tools.deleteDayTitle':count===1?'tools.deleteEntry':'tools.deleteEntries');
  const prompt=coreText(day?'tools.deleteDayConfirm':count===1?'tools.deleteOneConfirm':'tools.deleteConfirm',{count});
  const action=day?coreText('tools.deleteAll'):t('mobileRepeat.delete');
  show(`<section class="diary-delete-confirm" data-scope="${e(source.scope)}" ${!day&&count===1?'data-single':''}><h2 id="sheet-title">${e(title)}</h2><p>${e(prompt)}</p><p role="status"></p><footer><button type="button" data-close>${e(t('common.cancel'))}</button><button type="button" data-confirm>${e(action)}</button></footer></section>`);
  const button=content.querySelector('[data-confirm]'),status=content.querySelector('[role=status]');
  button.onclick=async()=>{button.disabled=true;try{await save('records.delete',{selection:source,confirmed:true},revision);}catch(error){if(status.isConnected){status.textContent=error.message;button.disabled=false;}}};
 }
 async function reusable(source,kind,title=t('diaryActions.selection.'+kind)){
  const result=await busy(title,()=>Promise.all([prepare({operation:kind,selection:source}),localLibraryView().then(view=>view??request('/api/library'))]));
  if(!result)return;
  const [selection,data]=result,mount=kind==='recipe'?mountRecipeEditor:mountMealEditor;
  const common={data,date,show,close,content,openEntry,onSaved:()=>{reset();render();void onChange();}};
  const imported=prepared=>mountRecipeEditor({...common,imported:prepared,draft:prepared.recipe});
  const {id,...draft}=selection.resource;
  mount({...common,draft:{...draft,name:''},selection,saved:{ingredients:selection.items},onImported:imported});

 }

 function select(source){selecting=true;selected=new Set(refs(source).map(({collection,row})=>key(collection,row.id)));close();render();}
 const actions={copy:capture,paste:copy,clear,move,time,meal:source=>reusable(source,'meal'),recipe:source=>reusable(source,'recipe'),nutrition:source=>onNutrition(source),delete:remove};
 function menuSheet(label,items,choose,style=''){
  show(`<section class="diary-menu-sheet ${style}" aria-label="${e(label)}"><h2 id="sheet-title" class="diary-menu-title">${e(label)}</h2>${items.map(item=>button((item.icon?`<img src="${e(item.icon)}" alt=""><span>${e(item.label)}</span>`:e(item.label)),item.id,item.disabled)).join('')}<p role="status" class="sheet-message"></p></section>`);
  const root=content.querySelector('.diary-menu-sheet');
  root.querySelectorAll('[data-diary-tool]').forEach(node=>node.onclick=async()=>{node.disabled=true;try{await choose(node.dataset.diaryTool);}catch(error){if(root.isConnected)root.querySelector('[role=status]').textContent=error.message;}finally{node.disabled=false;}});
 }
 async function copyPreviousDay(group){
  const destination={date:date(),group:group&&diary().groups.includes(group)?group:null},previous=new Date(date()+'T12:00:00Z');previous.setUTCDate(previous.getUTCDate()-1);
  const day=previous.toISOString().slice(0,10);
  const review=await busy(group===undefined?coreText('diary.copyPreviousDay'):coreText('diary.groupPrevious'),async()=>{
   let selection={date:day,scope:'day'};
   if(group!==undefined){const state=await localWorkspaceState(),view=state?projectLocalDiary(state,day):await request('/api/diary?date='+day);selection=groupSelection(group,view,day);}
   if(selection.scope==='selected'&&!selection.records.length)return {empty:true};
   return prepare({operation:'copy',selection,destination});
  });if(!review)return;if(review.empty){close();return;}
  return save('records.copy',{selection:review.selection,destination:review.destination,fingerprint:review.fingerprint,confirmed:true},review.revision,{diaryReview:review.localReview});
 }
 async function quickAdd(group){
  const origin=content.firstElementChild;
  const state=await localWorkspaceState(),view=state?createDisplayView(state):await request('/api/display'),policy=view.settings.diaryQuickAdd;
  if(!origin?.isConnected)return;
  const current=policy.shortcuts.find(row=>row.group===group)?.action??'food';
  actionForm(coreText('diary.groupQuickAdd'),`<div class="diary-tools-choices">${view.quickAddActions.map(({id})=>`<label><input type="radio" name="action" value="${e(id)}" ${id===current?'checked':''}><span>${e(t('shortcut.'+id))}</span></label>`).join('')}</div>`,values=>save('display.save',{diaryQuickAdd:{version:1,shortcuts:[...policy.shortcuts.filter(row=>row.group!==group),{group,action:values.action}]}}));
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
   {id:'copy-previous',label:coreText('diary.copyPreviousDay'),disabled:diary().completed},
   {id:'clear',label:coreText('diary.clearAllAmounts'),disabled:diary().completed},
   {id:'delete',label:coreText('diary.deleteAll'),disabled:diary().completed}
  ];
  const icons={complete:'/diary-action-icons/check-circle.svg',report:groupIcons.nutrition,share:'/diary-action-icons/share-nodes.svg','sort-all':'/diary-action-icons/sort-time.svg',select:groupIcons.recipe,copy:groupIcons.copy,paste:groupIcons.paste,'copy-previous':'/diary-action-icons/copy-previous.svg',clear:'/diary-action-icons/clear-amounts.svg',delete:groupIcons.delete};
  menuSheet(t('nav.diary'),items.map(item=>({...item,icon:icons[item.id]})),async action=>{
   if(action==='select'){selecting=true;selected.clear();close();render();}
   else if(action==='complete'){await onComplete();close();}
   else if(action==='report'){close();onReport();}
   else if(action==='share')onShare();
   else if(action==='sort-all')await save('diary.sort-all',{});
   else if(action==='copy-previous')await copyPreviousDay();
   else if(action==='paste')copy(clipboard);
   else await actions[action](all());
  },'diary-day-menu');
  menuNavigation();
 }

 function menuNavigation(){
  content.insertAdjacentHTML('beforeend',`<nav class="dc-bottom diary-menu-navigation" aria-label="${e(t('discover.nav.main'))}">${bottomNavigation('diary',uiLanguage())}</nav>`);
  content.querySelector('.diary-menu-navigation').onclick=event=>{
   const route=event.target.closest('[data-discover]')?.dataset.discover;
   if(route){close();document.querySelector(`.app-nav [data-discover="${route}"]`)?.click();}
  };
 }

 function selectionMenu(){
  const source=selection(),records=refs(source),count=records.length,foods=records.filter(({collection,row})=>collection==='entries'&&row.kind!=='exercise'),foodOnly=!!count&&foods.length===count;
  const items=[
   {id:'time',label:coreText('diary.selectedTime'),disabled:!count||diary().completed},
   {id:'recipe',label:coreText('diary.selectedRecipe'),disabled:!foodOnly},
   {id:'meal',label:coreText('diary.selectedMeal'),disabled:!foodOnly},
   {id:'copy',label:coreText('tools.copy'),disabled:!count},
   {id:'nutrition',label:coreText('diary.selectedNutrition'),disabled:!foods.length},
   {id:'delete',label:t('mobileRepeat.delete'),disabled:!count}
  ];
  menuSheet(coreText('diary.selectedActions'),items.map(item=>({...item,icon:groupIcons[item.id]})),action=>actions[action](source));
  menuNavigation();
 }

 function groupMenu(group){
  const source=groupSelection(group),records=refs(source),configured=diary().groups.includes(group),completed=diary().completed;
  const foods={...source,records:records.filter(({collection,row})=>collection==='entries'&&row.kind!=='exercise').map(({collection,row})=>({collection,id:row.id}))};
  const items=[
   {id:'time',label:coreText('diary.groupTime'),disabled:!records.length||completed},
   {id:'sort',label:coreText('diary.groupSort'),disabled:!configured},
   {id:'previous',label:coreText('diary.groupPrevious'),disabled:completed},
   {id:'recipe',label:coreText('diary.groupRecipe'),disabled:!foods.records.length},
   {id:'meal',label:coreText('diary.groupMeal'),disabled:!foods.records.length},
   {id:'quickAdd',label:coreText('diary.groupQuickAdd'),disabled:!configured},
   {id:'copy',label:coreText('tools.copy'),disabled:!records.length},
   ...(clipboard?[{id:'paste',label:t('mobileCompositeEditor.paste'),disabled:completed}]:[]),
   {id:'nutrition',label:coreText('diary.selectedNutrition'),disabled:!foods.records.length},
   {id:'delete',label:t('mobileRepeat.delete'),disabled:!records.length||completed}
  ];
  menuSheet(group,items.map(item=>({...item,icon:groupIcons[item.id]})),action=>{
   if(action==='time')return time(source,coreText('diary.groupTime'));
   if(action==='sort')return save('group.order',{group,mode:'time'});
   if(action==='previous')return copyPreviousDay(group);
   if(action==='recipe'||action==='meal')return reusable(foods,action,coreText(action==='recipe'?'diary.groupRecipe':'diary.groupMeal'));
   if(action==='quickAdd')return quickAdd(group);
   if(action==='paste')return copy(clipboard,group);
   return actions[action](source);
  });
 }
 async function expand(entry){
  const review=await busy(mealText('expand'),()=>prepare({operation:'expand',date:entry.date,id:entry.id}));if(!review)return;
  try{await save('entry.expand',{date:review.date,id:review.id,fingerprint:review.fingerprint,confirmed:true},review.revision,{entries:review.items,diaryReview:review.localReview});}
  catch(error){const status=content.querySelector('[role=status]');if(status)status.textContent=error.message;}
 }
 async function mealSettings(){
  const view=await busy(mealText('settings'),async()=>{
   const state=await localWorkspaceState();
   return state?{...createDisplayView(state),revision:diary().revision}:request('/api/display');
  });if(!view)return;
  const form=actionForm(mealText('settings'),`<label class="field-row"><span>${e(t('mobileDisplay.alwaysExpandMeals'))}</span><input type="checkbox" role="switch" name="alwaysExpandMeals" ${view.settings.alwaysExpandMeals?'checked':''}></label>`,()=>save('display.save',{alwaysExpandMeals:form.elements.alwaysExpandMeals.checked},view.revision));
 }
 function recordMenu(collection,id,onEdit){
  const source={date:date(),scope:'selected',records:[{collection,id}]},entry=collection==='entries'?diary().entries.find(row=>row.id===id):null,isMeal=!!entry?.mealId;
  if(isMeal){
   const items=[
    {id:'repeat',label:mealText('repeat'),icon:'/diary-action-icons/repeat.svg'},
    {id:'original',label:mealText('original'),icon:groupIcons.quickAdd},
    {id:'copy-edit',label:mealText('copyEdit'),icon:groupIcons.copy},
    {id:'adjust',label:mealText('adjust'),icon:'/diary-action-icons/adjust.svg',disabled:diary().completed},
    {id:'expand',label:mealText('expand'),icon:'/diary-action-icons/expand.svg',disabled:diary().completed},
    {id:'settings',label:mealText('settings'),icon:'/record-source/biometric-icons/cog-outline.svg'},
    {id:'copy',label:coreText('tools.copy'),icon:groupIcons.copy},
    {id:'nutrition',label:mealText('nutrition'),icon:groupIcons.nutrition},
    {id:'delete',label:t('mobileRepeat.delete'),icon:groupIcons.delete,disabled:diary().completed}
   ];
   return menuSheet(entry.facts?.name??entry.name??coreText('tools.entry'),items,action=>{
    if(action==='expand')return expand(entry);
    if(action==='settings')return mealSettings();
    if(action==='copy'||action==='delete')return actions[action](source);
    return onMealAction?.(action,entry);
   },'diary-meal-menu');
  }
  screen(coreText('tools.entry'),`<div class="diary-tools-menu">${button(t('mobileNutrientTargets.edit'),'edit')}${button(t('cyclePanel.select'),'select')}${button(coreText('tools.copy'),'copy')}${button(coreText('tools.moveGroup'),'move')}${button(t('mobileRepeat.delete'),'delete')}</div>`);
  content.querySelectorAll('[data-diary-tool]').forEach(b=>b.onclick=()=>{const action=b.dataset.diaryTool;if(action==='edit')onEdit();else if(action==='select')select(source);else actions[action](source);});
 }
 return {
  menu,groupMenu,recordMenu,reset,selection:()=>selecting?selection():null,
  removeRecord(collection,id){if(!diary().completed)return remove({date:date(),scope:'selected',records:[{collection,id}]});},
  selectBox(collection,row){return selecting?`<input type="checkbox" class="diary-select" data-tool-select data-collection="${collection}" data-id="${e(row.id)}" aria-label="${e(coreText('tools.selectName',{name:name(collection,row)}))}" ${selected.has(key(collection,row.id))?'checked':''}>`:'';},
  groupBox(group){const members=refs(groupSelection(group));return selecting?`<input type="checkbox" class="diary-select" data-tool-select-group="${e(group)}" aria-label="${e(coreText('tools.selectName',{name:group}))}" ${!members.length?'disabled':members.every(({collection,row})=>selected.has(key(collection,row.id)))?'checked':''}>`:'';},
  selectionHeader(icons){return selecting?`<div class="diary-selection-header"><button type="button" class="icon-button" data-diary-tool="done" aria-label="${e(t('mobileFoodEditor.back'))}">${icons.back}</button><h2>${e(coreText('diary.multiSelect'))}</h2><button type="button" class="icon-button" data-diary-menu aria-label="${e(coreText('diary.selectedActions'))}">${icons.more}</button></div>`:'';},
  toggleRow(target){if(!selecting||target.closest('input'))return false;const row=target.closest('[data-diary-record]');if(!row)return false;const k=key(row.dataset.collection,row.dataset.id);selected.has(k)?selected.delete(k):selected.add(k);render();return true;},
  change(event){const input=event.target;if(input.hasAttribute('data-tool-select')){const k=key(input.dataset.collection,input.dataset.id);input.checked?selected.add(k):selected.delete(k);render();return true;}if(input.hasAttribute('data-tool-select-group')){for(const {collection,row}of refs(groupSelection(input.dataset.toolSelectGroup))){const k=key(collection,row.id);input.checked?selected.add(k):selected.delete(k);}render();return true;}return false;},
  action(action){if(action==='done'){reset();render();return;}actions[action]?.(selection());},
  dispose(){reset();clipboard=null;}
 };
}
