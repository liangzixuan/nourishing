import {diaryEntryAmount,diaryGroupSubtotal} from './diary-table-presentation.js';
import {mountTargetsSheet} from './targets.js';
import {mountFoodCopy} from './food-copy.js';
import {mountFoodEntry} from './food-entry.js';
import {AddMenu} from './add-menu-source/add-menu.js';
import {createAppShell} from './app-shell.js';
import {mountMore} from './more.js';
import {diarySummaryMarkup,mountDiarySummary} from './diary-summary.js';
import {openDiarySummaryAction} from './diary-summary-actions.js';
import {diaryCycleMarkup} from './diary-cycle.js';
import {rememberOfflineAccount} from './offline-session.js';
import {mountTextLog} from './text-log.js';
import {notePhotoThumbnail} from './note-photos.js';
import {createDiaryTools} from './diary-tools.js';
import {openNutrientDetail} from './nutrient-detail.js';
import {openBarcode} from './barcode.js';
import {openEntryAdjustment} from './entry-adjustments.js';
import {openRecipeImport} from './recipe-import.js';
import {openFoodInsights} from './food-insights.js';
import {mountPhotoLog} from './photo-log.js';
import {mountRecordEditor} from './records.js';
import {mountRepeats} from './repeats.js';
import {mobileDiaryHeader,mobileDiaryGroups,mobileDiaryRecord,diarySymbol} from './diary-view.js';
import {escape as e} from './html.js';
import {request,command,clearPending,photoSaver} from './diary-api.js';
import {mountLibrary} from './library.js';
import {mountFoodPicker} from './food-picker.js';
import {mountNutrition} from './nutrition.js';
import {applyTheme} from './appearance.js';
const page=document.querySelector('#page'),dateBar=document.querySelector('#diary-date'),sheet=document.querySelector('#sheet'),content=document.querySelector('#sheet-content'),notice=document.querySelector('#notice');
const svg=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const icons={check:svg('<path d="m5 12 4 4L19 6"/>'),back:svg('<path d="m15 5-7 7 7 7"/>'),chevron:svg('<path d="m9 5 7 7-7 7"/>'),more:svg('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'),plus:svg('<path d="M12 5v14M5 12h14"/>'),close:svg('<path d="m6 6 12 12M18 6 6 18"/>'),food:svg('<path d="M5 3v7m4-7v7m-4-4h4M7 10v11M18 3v18m0-18c-4 3-4 9 0 9"/>')};
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const num=(v,d=1)=>Number.isFinite(v)?v.toLocaleString(undefined,{maximumFractionDigits:d}):'—';
const headerRoot=document.querySelector('.app-header'),shell=createAppShell({headerRoot,dateBar,navigation:document.querySelector('.app-nav')});
let addMenu=null;
let view='diary',library=null,nutrition=null,more=null,summaryPanel=null,pickerCleanup,account;
let accountReady=false;
let date=today(),diary=null,loadId=0,searchId=0,group='Uncategorized';
function show(html){pickerCleanup?.();pickerCleanup=null;searchId++;content.innerHTML=html;if(!sheet.open)sheet.showModal();sheet.scrollTop=0;}
function close(){pickerCleanup?.();pickerCleanup=null;searchId++;sheet.close();content.replaceChildren();}
const header=title=>`<header class="sheet-header"><button type="button" class="icon-button" data-close aria-label="Close">${icons.close}</button><h2 id="sheet-title">${e(title)}</h2></header>`;
const diaryTools=createDiaryTools({diary:()=>diary,date:()=>date,show,close,header,content,render,onChange:load,onDisplay:()=>summaryAction({action:'configure-diary-display'}),onScores:()=>summaryAction({action:'choose-scores'})});
sheet.addEventListener('click',event=>{if(event.target===sheet){const r=sheet.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}if(event.target.closest('[data-close]'))close();});
sheet.addEventListener('cancel',event=>{event.preventDefault();close();});
async function load(){const id=++loadId;notice.textContent='';page.setAttribute('aria-busy','true');try{if(!accountReady){account=await request('/api/account');await rememberOfflineAccount(account);accountReady=true;}const result=await request('/api/diary?date='+date);if(id!==loadId)return;diary=result;applyTheme(result.theme);if(view==='diary')render();}catch(error){if(id===loadId){notice.textContent=error.message;if(view==='diary')page.innerHTML='<p class="empty"><button type="button" data-reload>Try again</button><a href="/offline.html">Open offline diary</a></p>';}}finally{if(id===loadId)page.setAttribute('aria-busy','false');}}
function selectTab(id){shell.select(id);}
function leaveView(){diaryTools.reset();summaryPanel?.dispose();summaryPanel=null;library?.dispose();library=null;nutrition?.dispose();nutrition=null;more?.dispose();more=null;headerRoot.replaceChildren();}
function render(){
 summaryPanel?.dispose();
 selectTab('diary-tab');
 dateBar.hidden=false;document.querySelector('#diary-tab').setAttribute('aria-current','page');document.querySelector('#foods-tab').removeAttribute('aria-current');
 const s=diary.summary,totals=s.totals??{},calories=diary.consumedEnergy,energyUnit=diary.energyUnit,carbohydrate=s.carbohydrate;
 dateBar.innerHTML=mobileDiaryHeader({date,today:today(),complete:diary.completed,icons,menu:`<button type="button" data-diary-menu class="icon-button" aria-label="Diary actions">${icons.more}</button>`,labels:{today:'Today',complete:'Mark day complete',reopen:'Reopen day',previous:'Previous day',next:'Next day',date:'Diary date'},language:'en'});
 const calendar=dateBar.querySelector('[data-md-calendar]');calendar.outerHTML=`<label class="md-date-label">${calendar.innerHTML}<input aria-label="Diary date" type="date" value="${date}" id="date-picker"></label>`;
 const display=diary.recordDisplay,maps=Object.fromEntries(['entries','notes','biometrics'].map(collection=>[collection,new Map(diary[collection].map(row=>[row.id,row]))]));
 const records=display.groups.flatMap(group=>group.records.map(ref=>({...ref,group:group.name,row:maps[ref.collection].get(ref.id)})));
 const renderRow=({collection,row})=>{
  const time=diary.presentation?.settings?.showTimestamp===false?'':row.time;
  if(collection==='entries')return mobileDiaryRecord({id:row.id,collection,name:row.facts?.name??row.name,meta:e([time,row.kind==='exercise'?`${num(row.duration)} min`:row.quantity!==undefined?`${num(row.quantity)} ${row.unit==='portion'?(row.facts?.portionLabel??'portions'):row.unit}`:`${num(row.amount)} servings`].filter(Boolean).join(' · ')),amount:diaryEntryAmount(row,s.diaryTable,{energyUnit}),icon:diarySymbol(row.kind==='exercise'?'fitness_center':row.recipeId||row.mealId?'restaurant':'nutrition'),selectBox:diaryTools.selectBox(collection,row),action:'edit-entry'});
  const note=collection==='notes';return mobileDiaryRecord({id:row.id,collection,name:note?row.text:row.type,meta:e(time),amount:note?'':`${num(row.value,20)} ${e(row.unit)}`,icon:diarySymbol(note?'description':'monitor_heart'),selectBox:diaryTools.selectBox(collection,row),action:note?'edit-note':'edit-biometric',extra:note&&notePhotoThumbnail(row)?`<button type="button" class="icon-button" data-action="edit-note" aria-label="Open note photo">${notePhotoThumbnail(row)}</button>`:''});
 };
 page.innerHTML=`${diaryCycleMarkup(diary.cycleDays)}${diaryTools.toolbar()}${diarySummaryMarkup(diary)}<div class="md-diary diary-layout">${mobileDiaryGroups({groups:display.groups.map(group=>group.name),configuredGroups:diary.groups,records,renderRow,showGroups:display.showGroups,selectBox:group=>diaryTools.groupBox(group),subtotal:group=>diaryGroupSubtotal(s.diaryTable,group,{energyUnit})+`<button type="button" class="diary-group-tools" data-tool-group="${e(group)}" aria-label="${e(group)} actions">⋯</button>`,icons,labels:{add:'Add food'}})}</div>`;
 summaryPanel=mountDiarySummary({root:page,diary,onAction:summaryAction});
}
function openInsights(mode='suggestions',day=date){return openFoodInsights({mode,date:()=>day,show,close,header,content,onAdd:(kind,id,quantity)=>edit(null,id,'food',quantity),onAdded:load,onPreferences:load});}

document.addEventListener('change',event=>{if(diaryTools.change(event))return;if(event.target.id==='date-picker'){diaryTools.reset();date=event.target.value;load();}});
document.addEventListener('click',async event=>{
 const target=event.target.closest('button');if(!target)return;
 const action=target.dataset.action;
 if(target.hasAttribute('data-diary-menu'))return diaryTools.menu();
 if(target.dataset.toolGroup){event.preventDefault();return diaryTools.groupMenu(target.dataset.toolGroup);}
 if(target.dataset.diaryTool&&target.closest('.diary-selection-tools'))return diaryTools.action(target.dataset.diaryTool);
 if(target.dataset.diaryNutrient)return openNutrientDetail({nutrient:target.dataset.diaryNutrient,date,entryIds:null,show,header,content,onSource:source=>{const entry=diary.entries.find(row=>row.id===source.id);if(entry)edit(entry);}});
 if(target.hasAttribute('data-reload'))return load();
 if(target.hasAttribute('data-note'))return recordEditor('note');
 if(target.dataset.recordId){const kind=target.dataset.recordKind;return recordEditor(kind,diary[kind==='note'?'notes':'biometrics'].find(r=>r.id===target.dataset.recordId));}
 if(target.id==='add-food'){
  if(!diary)return;close();addMenu?.dispose();
  addMenu=new AddMenu({preferences:diary.presentation?.settings?.addMenu,onSave:async value=>{await command(diary.revision,'addMenu.save',{addMenu:value});await load();},onSelect:kind=>{
   const actions={food:search,photo:photoLog,voice:textLog,barcode:()=>barcode(),suggest:()=>openInsights(),fast:()=>navigate('discover','new-fast'),biometric:()=>recordEditor('biometric'),note:()=>recordEditor('note'),exercise:()=>recordEditor('exercise')};actions[kind]();
  }});return;
 }
 if(['prev-day','next-day'].includes(action)){diaryTools.reset();const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+(action==='prev-day'?-1:1));date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return load();}
 if(action==='complete-day'){target.disabled=true;try{await command(diary.revision,'day.complete',{date,completed:!diary.completed});await load();}catch(error){notice.textContent=error.message;}finally{target.disabled=false;}return;}
 if(['add-food','group-quick-add'].includes(action)){group=target.dataset.group??(diary?.groups.includes('Uncategorized')?'Uncategorized':diary?.groups[0]);return search();}
 if(['edit-entry','edit-note','edit-biometric'].includes(action)||target.hasAttribute('data-md-context')){
  const ref=target.closest('[data-diary-record]');if(!ref)return;
  const collection=ref.dataset.collection,id=ref.dataset.id,row=diary[collection]?.find(row=>row.id===id);if(!row)return;
  const open=()=>collection==='notes'?recordEditor('note',row):collection==='biometrics'?recordEditor('biometric',row):row.kind==='exercise'?recordEditor('exercise',row):edit(row);
  return target.hasAttribute('data-md-context')?diaryTools.recordMenu(collection,id,open):open();
 }
 if(target.id==='discover-tab')return navigate('discover');
 if(target.id==='settings-tab')return navigate('more');
 if(target.hasAttribute('data-recipe-import')){let pending;return openRecipeImport({show,close,header,content,onSave:async input=>{const signature=JSON.stringify(input);if(pending?.signature!==signature)pending={signature,body:{...input,requestId:crypto.randomUUID()}};const result=await request('/api/recipe-import/save',pending.body);pending=null;await load();await library?.reload();return result;}});}
 if(target.dataset.foodInsight)return openInsights(target.dataset.foodInsight);
 if(target.hasAttribute('data-library-repeats')){leaveView();view='repeats';selectTab('foods-tab');library=mountRepeats({page,headerRoot,onExit:()=>navigate('foods'),show,close,header,content,date:()=>date,onChange:load});return;}
 if(target.id==='foods-tab')return navigate('foods');
 if(target.id==='diary-tab')return navigate('diary');
});
function navigate(next,initialTab='dashboard',reportDate){
 leaveView();view=next;window.scrollTo(0,0);
 const common={page,headerRoot,date:()=>date,show,close,header,content,onChange:load,onDiary:nextDate=>{date=nextDate;return navigate('diary');}};
 if(next==='diary'){selectTab('diary-tab');return load();}
 if(next==='foods'){selectTab('foods-tab');library=mountLibrary({...common,openEntry:(kind,id)=>edit(null,id,kind)});return;}
 if(next==='more'){selectTab('settings-tab');more=mountMore({...common,identity:account?.name||'My workspace',onFoods:()=>navigate('foods'),onDiscover:tab=>navigate('discover',tab)});return;}
 selectTab('discover-tab');nutrition=mountNutrition({...common,mode:'discover',initialTab,reportDate,onSuggest:day=>{date=day;return openInsights('suggestions',day);}});
}
function sourceTargets(){pickerCleanup=mountTargetsSheet({date:()=>date,show,close,header,content,onChange:load});}
async function summaryAction(input){
 if(input.action==='open-fasting')return navigate('discover','fasting');
 if(input.action==='edit-day-targets'){pickerCleanup=mountTargetsSheet({date:()=>date,show,close,header,content,onChange:load,initialScreen:'day'});return;}
 if(input.action==='all-nutrients')return navigate('discover','report',date);
 if(input.action==='water'){try{await command(diary.revision,'water.add',{date,time:new Date().toTimeString().slice(0,5),amount:input.amount});await load();}catch(error){notice.textContent=error.message;}return;}
 if(input.action==='water-custom'){
  show(header('Add Water')+'<form class="entry-form"><label class="field-row"><span>Amount (mL)</span><input name="amount" type="number" min="1" step="any" value="250" required></label><p class="sheet-message" role="status"></p><footer class="entry-actions"><button class="primary">Add to Diary</button></footer></form>');
  const form=content.querySelector('form');form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;try{await command(diary.revision,'water.add',{date,time:new Date().toTimeString().slice(0,5),amount:Number(form.elements.amount.value)});await load();if(form.isConnected)close();}catch(error){if(form.isConnected)form.querySelector('[role=status]').textContent=error.message;}finally{button.disabled=false;}};return;
 }
 if(input.action==='nutrient-contributors')return openNutrientDetail({nutrient:input.id,date,show,header,content});
 openDiarySummaryAction({...input,diary,date,show,close,header,content,onChange:load,onTargets:sourceTargets,onReport:day=>navigate('discover','report',day)});
}
async function search(restore=null,{applied,selected}={}){
 if(!diary)return;
 if(!diary.groups.includes(group))group=diary.groups.includes('Uncategorized')?'Uncategorized':diary.groups[0];
 show(`${header('Add Food')}<div class="diary-picker"></div>`);
 const picker=mountFoodPicker(content.querySelector('.diary-picker'),{
  onPick:(kind,id)=>{const snapshot=picker.snapshot();return edit(null,id,kind,undefined,()=>search(snapshot));},
  onBarcode:()=>searchBarcode('camera',picker.snapshot()),onBranded:()=>searchBarcode('search',picker.snapshot()),
  multi:{ownerId:account.id,defaults:restore?.defaults??{date,group,time:new Date().toTimeString().slice(0,5)},restore,
   onEdit:async row=>{
    const snapshot=picker.snapshot(),serial=searchId,kind=({catalog:'food',foods:'food',recipes:'recipe',meals:'meal'})[row.selection.kind];
    const item=await request('/api/library/item?'+new URLSearchParams({kind,id:row.selection.id}));
    if(serial!==searchId||!sheet.open)return;
    const detail=viewState=>{pickerCleanup=mountFoodEntry({item,draft:row.entry,date,group,groups:diary.groups,revision:()=>diary.revision,show,close,content,viewState,
     onChange:load,onBack:()=>search(snapshot),onApply:value=>search(snapshot,{applied:value}),onCopy:kind==='food'?kept=>copyFood(item,()=>detail(kept)):undefined});};detail();
   },
   onSaved:async result=>{await load();close();notice.textContent=result.item?.kind==='recipe'?'Recipe created':'Items added to diary';}
  }
 });
 pickerCleanup=picker;await picker.ready;if(pickerCleanup!==picker)return;
 if(applied)picker.applyEntry(applied);
 if(selected)picker.select(selected.row,selected.entry);
 picker.returnFromDetail();
}
function searchBarcode(mode,snapshot){
 const returnToSearch=()=>search(snapshot);
 const barcodeHeader=title=>header(title).replace('data-close','data-barcode-back');
 pickerCleanup=openBarcode({mode,show,close:returnToSearch,header:barcodeHeader,content,date:()=>date,groups:diary.groups,group,onChange:load,revision:()=>diary.revision,
  ...(snapshot.multi.enabled?{onSelect:async (row,entry)=>search(snapshot,{selected:{row,entry}})}:{})});
}
async function edit(entry,id=entry?.foodId??entry?.recipeId??entry?.mealId,kind=entry?.recipeId?'recipe':entry?.mealId?'meal':'food',quantity,returnSearch){
 if(!id){show(`${header('Diary entry')}<p class="empty">Editing this record type is not available in the cloud preview yet.</p>`);return;}
 show(`${header('Food')}<p class="empty">Loading…</p>`);const serial=searchId;
 try{const item=await request('/api/library/item?'+new URLSearchParams({kind,id,...(entry?{entryId:entry.id}:{})}));if(serial!==searchId||!sheet.open)return;foodEditor(item,entry,quantity,returnSearch);}catch(error){if(serial===searchId)content.innerHTML=header('Food')+`<p class="sheet-message">${e(error.message)}</p>`;}
}
function foodEditor(item,entry,quantity,returnSearch,viewState){
 pickerCleanup=mountFoodEntry({item,entry,quantity,date,group,groups:diary.groups,viewState,onCopy:item.kind==='food'?kept=>copyFood(item,()=>foodEditor(item,entry,quantity,returnSearch,kept)):undefined,revision:()=>diary.revision,show,close,content,
  onChange:async()=>{await load();if(view==='foods')await library?.reload();},onBack:returnSearch??search,
  onAdjust:()=>openEntryAdjustment({kind:item.kind,date:entry.date,id:entry.id,show,close,header,content,onSave:load,onBack:()=>edit(entry)}),
  onConflict:async()=>{await load();if(entry){const latest=diary.entries.find(row=>row.id===entry.id);if(latest)edit(latest);else close();}}
 });
}
function copyFood(item,onCancel){pickerCleanup=mountFoodCopy({selection:item.copySelection,show,content,onCancel,onSaved:async()=>{await load();if(view==='foods')await library?.reload();close();notice.textContent='Food created';}});}
function photoLog(){if(!diary)return;return mountPhotoLog({show,close,header,content,date:()=>date,groups:diary.groups,save:photoSaver(()=>diary.revision),onChange:load});}
function recordEditor(kind,record){return mountRecordEditor({kind,record,date,show,close,header,content,onChange:load});}
window.addEventListener('pagehide',()=>{addMenu?.dispose();addMenu=null;diaryTools.dispose();loadId++;leaveView();view='diary';clearPending();diary=null;close();page.replaceChildren();});
window.addEventListener('pageshow',event=>{if(event.persisted)load();});
load();

function barcode(mode='camera'){if(!diary)return;openBarcode({mode,show,close,header,content,date:()=>date,groups:diary.groups,group,onChange:load,revision:()=>diary.revision});}

function textLog(){if(!diary)return;const log=mountTextLog({show,close,header,content,date:()=>date,groups:diary.groups,onChange:load});pickerCleanup=log.dispose;}
