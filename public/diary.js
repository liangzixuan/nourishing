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
import {mountRecordEditor,mountRecordMenu} from './records.js';
import {mountRepeats} from './repeats.js';
import {mobileDiaryHeader,mobileDiaryGroups,mobileDiaryRecord} from './diary-view.js';
import {escape as e} from './html.js';
import {request,command,clearPending,photoSaver} from './diary-api.js';
import {mountLibrary} from './library.js';
import {mountFoodPicker} from './food-picker.js';
import {mountNutrition} from './nutrition.js';
import {applyTheme} from './appearance.js';
import {quantityFields,quantityValue} from './quantity.js';
const page=document.querySelector('#page'),dateBar=document.querySelector('#diary-date'),sheet=document.querySelector('#sheet'),content=document.querySelector('#sheet-content'),notice=document.querySelector('#notice');
const svg=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const icons={check:svg('<path d="m5 12 4 4L19 6"/>'),back:svg('<path d="m15 5-7 7 7 7"/>'),chevron:svg('<path d="m9 5 7 7-7 7"/>'),more:svg('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'),plus:svg('<path d="M12 5v14M5 12h14"/>'),close:svg('<path d="m6 6 12 12M18 6 6 18"/>'),food:svg('<path d="M5 3v7m4-7v7m-4-4h4M7 10v11M18 3v18m0-18c-4 3-4 9 0 9"/>')};
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const num=(v,d=1)=>Number.isFinite(v)?v.toLocaleString(undefined,{maximumFractionDigits:d}):'—';
let view='diary',library=null,nutrition=null,pickerCleanup;
let accountReady=false;
let date=today(),diary=null,loadId=0,searchId=0,group='Uncategorized';
function show(html){pickerCleanup?.();pickerCleanup=null;searchId++;content.innerHTML=html;if(!sheet.open)sheet.showModal();sheet.scrollTop=0;}
function close(){pickerCleanup?.();pickerCleanup=null;searchId++;sheet.close();content.replaceChildren();}
const header=title=>`<header class="sheet-header"><button type="button" class="icon-button" data-close aria-label="Close">${icons.close}</button><h2 id="sheet-title">${e(title)}</h2></header>`;
const diaryTools=createDiaryTools({diary:()=>diary,date:()=>date,show,close,header,content,render,onChange:load});
sheet.addEventListener('click',event=>{if(event.target===sheet){const r=sheet.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}if(event.target.closest('[data-close]'))close();});
sheet.addEventListener('cancel',event=>{event.preventDefault();close();});
async function load(){const id=++loadId;notice.textContent='';page.setAttribute('aria-busy','true');try{if(!accountReady){await rememberOfflineAccount(await request('/api/account'));accountReady=true;}const result=await request('/api/diary?date='+date);if(id!==loadId)return;diary=result;applyTheme(result.theme);if(view==='diary')render();}catch(error){if(id===loadId){notice.textContent=error.message;if(view==='diary')page.innerHTML='<p class="empty"><button type="button" data-reload>Try again</button><a href="/offline.html">Open offline diary</a></p>';}}finally{if(id===loadId)page.setAttribute('aria-busy','false');}}
function selectTab(id){document.querySelectorAll('.app-nav [aria-current]').forEach(b=>b.removeAttribute('aria-current'));document.getElementById(id).setAttribute('aria-current','page');}
function leaveView(){diaryTools.reset();library?.dispose();library=null;nutrition?.dispose();nutrition=null;}
function render(){
 selectTab('diary-tab');
 dateBar.hidden=false;document.querySelector('#diary-tab').setAttribute('aria-current','page');document.querySelector('#foods-tab').removeAttribute('aria-current');
 const s=diary.summary,totals=s.totals??{},calories=diary.consumedEnergy,energyUnit=diary.energyUnit,carbohydrate=s.carbohydrate;
 dateBar.innerHTML=mobileDiaryHeader({date,today:today(),complete:diary.completed,icons,menu:`<button type="button" data-diary-menu class="icon-button" aria-label="Diary actions">${icons.more}</button>`,labels:{today:'Today',complete:'Mark day complete',reopen:'Reopen day',previous:'Previous day',next:'Next day',date:'Diary date'},language:'en'});
 dateBar.querySelector('[data-md-calendar]').outerHTML=`<label class="md-date-label"><input aria-label="Diary date" type="date" value="${date}" id="date-picker"></label>`;
 const names=[...new Set([...diary.groups,...diary.entries.map(r=>r.group)])];
 page.innerHTML=`${diaryTools.toolbar()}<section class="calorie-summary" aria-label="Daily nutrition"><button type="button" class="energy-ring" data-diary-nutrient="calories" aria-label="Energy details"><strong>${num(calories??0,0)}</strong><small>${e(energyUnit)}</small></button><div>${[['protein','Protein'],[carbohydrate?.definition.mode==='net'?'netCarbohydrate':'carbs',carbohydrate?.definition.mode==='net'?'Net Carbs':'Carbs'],['fat','Fat']].map(([id,label])=>`<button type="button" class="macro-row" data-diary-nutrient="${id}"><strong>${label}</strong><span>${num((id==='carbs'||id==='netCarbohydrate'?carbohydrate?.value:totals[id])??0)} g</span></button>`).join('')}</div></section><div class="md-diary diary-layout">${mobileDiaryGroups({groups:names,configuredGroups:diary.groups,records:diary.entries,renderRow:entry=>mobileDiaryRecord({id:entry.id,collection:'entries',name:entry.facts?.name??entry.name,meta:e([entry.time,entry.kind==='exercise'?`${num(entry.duration)} min`:entry.quantity!==undefined?`${num(entry.quantity)} ${entry.unit==='portion'?(entry.facts?.portionLabel??'portions'):entry.unit}`:`${num(entry.amount)} servings`].filter(Boolean).join(' · ')),amount:`${num(entry.energyValue,0)}<br>${e(energyUnit)}`,icon:icons.food,selectBox:diaryTools.selectBox('entries',entry),action:'edit-entry'}),selectBox:group=>diaryTools.groupBox(group),subtotal:group=>`<button type="button" class="diary-group-tools" data-tool-group="${e(group)}" aria-label="${e(group)} actions">⋯</button>`,icons,labels:{add:'Add food'}})}</div><section class="record-section"><div class="section-actions"><h2>Notes</h2><button type="button" data-note>Add note</button></div>${diary.notes.map(row=>`<div class="diary-record-selectable">${diaryTools.selectBox('notes',row)}<button type="button" class="record-text" data-record-kind="note" data-record-id="${e(row.id)}">${notePhotoThumbnail(row)}${e(row.time)} ${e(row.text)}</button></div>`).join('')}</section>${diary.biometrics.length?`<section class="record-section"><h2>Biometrics</h2>${diary.biometrics.map(row=>`<div class="diary-record-selectable">${diaryTools.selectBox('biometrics',row)}<button type="button" class="record-text" data-record-kind="biometric" data-record-id="${e(row.id)}">${e(row.type)} · ${e(row.value)} ${e(row.unit)}</button></div>`).join('')}</section>`:''}`;
}
function openInsights(mode='suggestions',day=date){return openFoodInsights({mode,date:()=>day,show,close,header,content,onAdd:(kind,id,quantity)=>edit(null,id,'food',quantity),onAddMeal:async input=>{await command(input.revision,'meal.log',{date:input.date,time:input.time,group:input.group,rows:input.rows.map(row=>({foodId:row.ref.id,...(row.unit==='servings'?{amount:row.quantity}:{quantity:row.quantity,unit:row.unit,...(row.unit==='portion'?{portionId:row.portionId}:{})})}))});await load();}});}

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
 if(target.id==='add-food'){return mountRecordMenu({show,header,content,onPick:kind=>kind==='food'?search():kind==='photo'?photoLog():kind==='text'?textLog():kind==='barcode'?barcode():recordEditor(kind)});}
 if(['prev-day','next-day'].includes(action)){diaryTools.reset();const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+(action==='prev-day'?-1:1));date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return load();}
 if(action==='complete-day'){target.disabled=true;try{await command(diary.revision,'day.complete',{date,completed:!diary.completed});await load();}catch(error){notice.textContent=error.message;}finally{target.disabled=false;}return;}
 if(['add-food','group-quick-add'].includes(action)){group=target.dataset.group??(diary?.groups.includes('Uncategorized')?'Uncategorized':diary?.groups[0]);return search();}
 if(action==='edit-entry'||target.hasAttribute('data-md-context')){const id=target.dataset.id??target.closest('[data-id]')?.dataset.id;const entry=diary.entries.find(row=>row.id===id);if(target.hasAttribute('data-md-context'))return diaryTools.recordMenu('entries',id,()=>entry?.kind==='exercise'?recordEditor('exercise',entry):edit(entry));return entry?.kind==='exercise'?recordEditor('exercise',entry):edit(entry);}
 if(['discover-tab','settings-tab'].includes(target.id)){leaveView();view=target.id==='discover-tab'?'discover':'targets';dateBar.hidden=true;selectTab(target.id);nutrition=mountNutrition({page,mode:view,date:()=>date,show,close,header,content,onChange:load,onSuggest:day=>{date=day;return openInsights('suggestions',day);},onDiary:nextDate=>{leaveView();date=nextDate;view='diary';selectTab('diary-tab');load();}});return;}
 if(target.hasAttribute('data-recipe-import')){let pending;return openRecipeImport({show,close,header,content,onSave:async input=>{const signature=JSON.stringify(input);if(pending?.signature!==signature)pending={signature,body:{...input,requestId:crypto.randomUUID()}};const result=await request('/api/recipe-import/save',pending.body);pending=null;await load();await library?.reload();return result;}});}
 if(target.dataset.foodInsight)return openInsights(target.dataset.foodInsight);
 if(target.hasAttribute('data-library-repeats')){leaveView();view='repeats';dateBar.hidden=true;selectTab('foods-tab');library=mountRepeats({page,show,close,header,content,date:()=>date,onChange:load});return;}
 if(target.id==='foods-tab'){leaveView();selectTab('foods-tab');view='foods';dateBar.hidden=true;document.querySelector('#foods-tab').setAttribute('aria-current','page');document.querySelector('#diary-tab').removeAttribute('aria-current');library?.dispose();library=mountLibrary({page,show,close,header,content,date:()=>date,openEntry:(kind,id)=>edit(null,id,kind),onChange:load});return;}
 if(target.id==='diary-tab'){leaveView();view='diary';library?.dispose();library=null;dateBar.hidden=false;document.querySelector('#diary-tab').setAttribute('aria-current','page');document.querySelector('#foods-tab').removeAttribute('aria-current');return load();}
});
function search(){
 if(!diary)return;show(`${header('Add Food')}<div class="diary-picker"></div>`);pickerCleanup=mountFoodPicker(content.querySelector('.diary-picker'),{onPick:(kind,id)=>edit(null,id,kind),onBarcode:()=>barcode(),onBranded:()=>barcode('search')});
}
async function edit(entry,id=entry?.foodId??entry?.recipeId??entry?.mealId,kind=entry?.recipeId?'recipe':entry?.mealId?'meal':'food',quantity){
 if(!id){show(`${header('Diary entry')}<p class="empty">Editing this record type is not available in the cloud preview yet.</p>`);return;}
 show(`${header('Food')}<p class="empty">Loading…</p>`);const serial=searchId;
 try{const item=await request('/api/library/item?'+new URLSearchParams({kind,id,...(entry?{entryId:entry.id}:{})}));if(serial!==searchId||!sheet.open)return;foodEditor(item,entry,quantity);}catch(error){if(serial===searchId)content.innerHTML=header('Food')+`<p class="sheet-message">${e(error.message)}</p>`;}
}
function foodEditor({resource:food,options,kind},entry,quantity){
 show(`${header(food.name)}<form class="entry-form">${quantityFields(options,entry??quantity??{})}<label class="field-row"><span>Group</span><select name="group" aria-label="Group">${diary.groups.map(g=>`<option ${g===(entry?.group??group)?'selected':''}>${e(g)}</option>`).join('')}</select></label><label class="field-row"><span>Time</span><input type="time" name="time" value="${entry?.time??new Date().toTimeString().slice(0,5)}"></label><label class="field-row"><span>Date</span><input type="date" name="date" required value="${entry?.date??date}"></label><div class="nutrition-preview" aria-live="polite"></div><p class="food-source">${e(food.source?.name??(kind==='food'?'Custom food':kind==='recipe'?'Recipe':'Meal'))}</p><p class="sheet-message" role="status"></p>${entry&&['recipe','meal'].includes(kind)?'<button type="button" class="more-results" data-adjust-ingredients>Adjust ingredients</button>':''}<footer class="entry-actions">${entry?'<button type="button" data-delete class="danger">Delete</button>':''}<button type="submit" class="primary">${entry?'Save changes':'Add to diary'}</button></footer></form>`);
 const form=content.querySelector('form'),status=form.querySelector('.sheet-message'),preview=form.querySelector('.nutrition-preview');
 const payload=()=>{const v=Object.fromEntries(new FormData(form));return {date:v.date,group:v.group,time:v.time,...(entry?{id:entry.id}:{[kind+'Id']:food.id}),...quantityValue(form)};};
 let timer,previewId=0;const update=()=>{clearTimeout(timer);const id=++previewId;preview.textContent='…';timer=setTimeout(async()=>{if(!form.isConnected)return;try{const result=await request('/api/diary/preview',payload());if(id!==previewId||!form.isConnected)return;const n=result.nutrition.totals;preview.innerHTML=`<strong>${num(result.energy.value,0)} ${e(result.energy.unit)}</strong><p>${num(n.protein)} g Protein · ${num(n.carbs)} g Carbs · ${num(n.fat)} g Fat</p>`;}catch(error){if(id===previewId&&form.isConnected)preview.textContent=error.message;}},180);};form.oninput=update;update();
 const save=async(type,payload)=>{form.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='';try{await command(diary.revision,type,payload);await load();if(view==='foods')await library?.reload();close();}catch(error){if(status.isConnected){status.textContent=error.message;if(error.status===409){const reload=document.createElement('button');reload.type='button';reload.textContent='Reload latest';reload.className='more-results';reload.onclick=async()=>{await load();if(entry){const latest=diary.entries.find(row=>row.id===entry.id);if(latest)edit(latest);else close();}else status.textContent='Diary refreshed. You can save this entry.';};status.append(reload);}}}finally{form.querySelectorAll('button').forEach(b=>b.disabled=false);}};
 form.onsubmit=event=>{event.preventDefault();save(entry?'entry.update':'entry.add',payload());};
 if(entry&&['recipe','meal'].includes(kind))form.querySelector('[data-adjust-ingredients]').onclick=()=>{clearTimeout(timer);previewId++;openEntryAdjustment({kind,date:entry.date,id:entry.id,show,close,header,content,onSave:load,onBack:()=>edit(entry)});};
 if(entry)form.querySelector('[data-delete]').onclick=()=>save('entry.delete',{id:entry.id});
}
function photoLog(){if(!diary)return;return mountPhotoLog({show,close,header,content,date:()=>date,groups:diary.groups,save:photoSaver(()=>diary.revision),onChange:load});}
function recordEditor(kind,record){return mountRecordEditor({kind,record,date,show,close,header,content,onChange:load});}
window.addEventListener('pagehide',()=>{diaryTools.dispose();loadId++;leaveView();view='diary';clearPending();diary=null;close();page.replaceChildren();});
window.addEventListener('pageshow',event=>{if(event.persisted)load();});
load();

function barcode(mode='camera'){if(!diary)return;openBarcode({mode,show,close,header,content,date:()=>date,groups:diary.groups,group,onChange:load,revision:()=>diary.revision});}

function textLog(){if(!diary)return;const log=mountTextLog({show,close,header,content,date:()=>date,groups:diary.groups,onChange:load});pickerCleanup=log.dispose;}
