import {mobileDiaryHeader,mobileDiaryGroups,mobileDiaryRecord} from './diary-view.js';
import {escape as e} from './html.js';
import {request,command,clearPending} from './diary-api.js';
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
let date=today(),diary=null,loadId=0,searchId=0,group='Uncategorized';
function show(html){pickerCleanup?.();pickerCleanup=null;searchId++;content.innerHTML=html;if(!sheet.open)sheet.showModal();sheet.scrollTop=0;}
function close(){pickerCleanup?.();pickerCleanup=null;searchId++;sheet.close();content.replaceChildren();}
const header=title=>`<header class="sheet-header"><button type="button" class="icon-button" data-close aria-label="Close">${icons.close}</button><h2 id="sheet-title">${e(title)}</h2></header>`;
sheet.addEventListener('click',event=>{if(event.target===sheet){const r=sheet.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}if(event.target.closest('[data-close]'))close();});
sheet.addEventListener('cancel',event=>{event.preventDefault();close();});
async function load(){const id=++loadId;notice.textContent='';page.setAttribute('aria-busy','true');try{const result=await request('/api/diary?date='+date);if(id!==loadId)return;diary=result;applyTheme(result.theme);if(view==='diary')render();}catch(error){if(id===loadId){notice.textContent=error.message;if(view==='diary')page.innerHTML='<p class="empty"><button type="button" data-reload>Try again</button></p>';}}finally{if(id===loadId)page.setAttribute('aria-busy','false');}}
function selectTab(id){document.querySelectorAll('.app-nav [aria-current]').forEach(b=>b.removeAttribute('aria-current'));document.getElementById(id).setAttribute('aria-current','page');}
function leaveView(){library?.dispose();library=null;nutrition?.dispose();nutrition=null;}
function render(){
 selectTab('diary-tab');
 dateBar.hidden=false;document.querySelector('#diary-tab').setAttribute('aria-current','page');document.querySelector('#foods-tab').removeAttribute('aria-current');
 const s=diary.summary,totals=s.totals??{},calories=s.energy?.consumed??totals.calories;
 dateBar.innerHTML=mobileDiaryHeader({date,today:today(),complete:diary.completed,icons,menu:'<button type="button" data-reload class="icon-button" aria-label="Refresh diary">↻</button>',labels:{today:'Today',complete:'Mark day complete',reopen:'Reopen day',previous:'Previous day',next:'Next day',date:'Diary date'},language:'en'});
 dateBar.querySelector('[data-md-calendar]').outerHTML=`<label class="md-date-label"><input aria-label="Diary date" type="date" value="${date}" id="date-picker"></label>`;
 const names=[...new Set([...diary.groups,...diary.entries.map(r=>r.group)])];
 page.innerHTML=`<section class="calorie-summary" aria-label="Daily nutrition"><div class="energy-ring"><strong>${num(calories??0,0)}</strong><small>kcal</small></div><div>${[['protein','Protein'],['carbs','Carbs'],['fat','Fat']].map(([id,label])=>`<div class="macro-row"><strong>${label}</strong><span>${num(totals[id]??0)} g</span></div>`).join('')}</div></section><div class="md-diary diary-layout">${mobileDiaryGroups({groups:names,configuredGroups:diary.groups,records:diary.entries,renderRow:entry=>mobileDiaryRecord({id:entry.id,collection:'entries',name:entry.facts?.name??entry.name,meta:e([entry.time,entry.quantity!==undefined?`${num(entry.quantity)} ${entry.unit==='portion'?(entry.facts?.portionLabel??'portions'):entry.unit}`:`${num(entry.amount)} servings`].filter(Boolean).join(' · ')),amount:`${num(entry.facts?.nutrients?.calories,0)}<br>kcal`,icon:icons.food,selectBox:'',action:'edit-entry'}),selectBox:()=>'',icons,labels:{add:'Add food'}})}</div><section class="record-section"><div class="section-actions"><h2>Notes</h2><button type="button" data-note>Add note</button></div>${diary.notes.map(row=>`<p>${e(row.time)} ${e(row.text)}</p>`).join('')}</section>${diary.biometrics.length?`<section class="record-section"><h2>Biometrics</h2>${diary.biometrics.map(row=>`<p>${e(row.type)} · ${e(row.value)} ${e(row.unit)}</p>`).join('')}</section>`:''}`;
}
document.addEventListener('change',event=>{if(event.target.id==='date-picker'){date=event.target.value;load();}});
document.addEventListener('click',async event=>{
 const target=event.target.closest('button');if(!target)return;
 const action=target.dataset.action;
 if(target.hasAttribute('data-reload'))return load();
 if(target.hasAttribute('data-note'))return noteEditor();
 if(['prev-day','next-day'].includes(action)){const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+(action==='prev-day'?-1:1));date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return load();}
 if(action==='complete-day'){target.disabled=true;try{await command(diary.revision,'day.complete',{date,completed:!diary.completed});await load();}catch(error){notice.textContent=error.message;}finally{target.disabled=false;}return;}
 if(['add-food','group-quick-add'].includes(action)||target.id==='add-food'){group=target.dataset.group??(diary?.groups.includes('Uncategorized')?'Uncategorized':diary?.groups[0]);return search();}
 if(action==='edit-entry'||target.hasAttribute('data-md-context')){const id=target.dataset.id??target.closest('[data-id]')?.dataset.id;return edit(diary.entries.find(row=>row.id===id));}
 if(['discover-tab','settings-tab'].includes(target.id)){leaveView();view=target.id==='discover-tab'?'discover':'targets';dateBar.hidden=true;selectTab(target.id);nutrition=mountNutrition({page,mode:view,date:()=>date,show,close,header,content,onChange:load});return;}
 if(target.id==='foods-tab'){leaveView();selectTab('foods-tab');view='foods';dateBar.hidden=true;document.querySelector('#foods-tab').setAttribute('aria-current','page');document.querySelector('#diary-tab').removeAttribute('aria-current');library?.dispose();library=mountLibrary({page,show,close,header,content,date:()=>date,openEntry:(kind,id)=>edit(null,id,kind),onChange:load});return;}
 if(target.id==='diary-tab'){leaveView();view='diary';library?.dispose();library=null;dateBar.hidden=false;document.querySelector('#diary-tab').setAttribute('aria-current','page');document.querySelector('#foods-tab').removeAttribute('aria-current');return load();}
});
function search(){
 if(!diary)return;show(`${header('Add Food')}<div class="diary-picker"></div>`);pickerCleanup=mountFoodPicker(content.querySelector('.diary-picker'),{onPick:(kind,id)=>edit(null,id,kind)});
}
async function edit(entry,id=entry?.foodId??entry?.recipeId??entry?.mealId,kind=entry?.recipeId?'recipe':entry?.mealId?'meal':'food'){
 if(!id){show(`${header('Diary entry')}<p class="empty">Editing this record type is not available in the cloud preview yet.</p>`);return;}
 show(`${header('Food')}<p class="empty">Loading…</p>`);const serial=searchId;
 try{const item=await request('/api/library/item?'+new URLSearchParams({kind,id,...(entry?{entryId:entry.id}:{})}));if(serial!==searchId||!sheet.open)return;foodEditor(item,entry);}catch(error){if(serial===searchId)content.innerHTML=header('Food')+`<p class="sheet-message">${e(error.message)}</p>`;}
}
function foodEditor({resource:food,options,kind},entry){
 show(`${header(food.name)}<form class="entry-form">${quantityFields(options,entry??{})}<label class="field-row"><span>Group</span><select name="group" aria-label="Group">${diary.groups.map(g=>`<option ${g===(entry?.group??group)?'selected':''}>${e(g)}</option>`).join('')}</select></label><label class="field-row"><span>Time</span><input type="time" name="time" value="${entry?.time??new Date().toTimeString().slice(0,5)}"></label><label class="field-row"><span>Date</span><input type="date" name="date" required value="${entry?.date??date}"></label><div class="nutrition-preview" aria-live="polite"></div><p class="food-source">${e(food.source?.name??(kind==='food'?'Custom food':kind==='recipe'?'Recipe':'Meal'))}</p><p class="sheet-message" role="status"></p><footer class="entry-actions">${entry?'<button type="button" data-delete class="danger">Delete</button>':''}<button type="submit" class="primary">${entry?'Save changes':'Add to diary'}</button></footer></form>`);
 const form=content.querySelector('form'),status=form.querySelector('.sheet-message'),preview=form.querySelector('.nutrition-preview');
 const payload=()=>{const v=Object.fromEntries(new FormData(form));return {date:v.date,group:v.group,time:v.time,...(entry?{id:entry.id}:{[kind+'Id']:food.id}),...quantityValue(form)};};
 let timer,previewId=0;const update=()=>{clearTimeout(timer);const id=++previewId;preview.textContent='…';timer=setTimeout(async()=>{if(!form.isConnected)return;try{const result=await request('/api/diary/preview',payload());if(id!==previewId||!form.isConnected)return;const n=result.nutrition.totals;preview.innerHTML=`<strong>${num(n.calories,0)} kcal</strong><p>${num(n.protein)} g Protein · ${num(n.carbs)} g Carbs · ${num(n.fat)} g Fat</p>`;}catch(error){if(id===previewId&&form.isConnected)preview.textContent=error.message;}},180);};form.oninput=update;update();
 const save=async(type,payload)=>{form.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='';try{await command(diary.revision,type,payload);await load();if(view==='foods')await library?.reload();close();}catch(error){if(status.isConnected){status.textContent=error.message;if(error.status===409){const reload=document.createElement('button');reload.type='button';reload.textContent='Reload latest';reload.className='more-results';reload.onclick=async()=>{await load();if(entry){const latest=diary.entries.find(row=>row.id===entry.id);if(latest)edit(latest);else close();}else status.textContent='Diary refreshed. You can save this entry.';};status.append(reload);}}}finally{form.querySelectorAll('button').forEach(b=>b.disabled=false);}};
 form.onsubmit=event=>{event.preventDefault();save(entry?'entry.update':'entry.add',payload());};
 if(entry)form.querySelector('[data-delete]').onclick=()=>save('entry.delete',{id:entry.id});
}
function noteEditor(){show(`${header('Add Note')}<form class="entry-form"><label class="field-row"><textarea name="text" aria-label="Note" required maxlength="10000"></textarea></label><p class="sheet-message" role="status"></p><footer class="entry-actions"><button class="primary">Save note</button></footer></form>`);const form=content.querySelector('form');form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;try{await command(diary.revision,'note.add',{date,time:new Date().toTimeString().slice(0,5),text:form.elements.text.value});close();await load();}catch(error){form.querySelector('.sheet-message').textContent=error.message;}finally{button.disabled=false;}};}
window.addEventListener('pagehide',()=>{loadId++;leaveView();view='diary';clearPending();diary=null;close();page.replaceChildren();});
window.addEventListener('pageshow',event=>{if(event.persisted)load();});
load();
