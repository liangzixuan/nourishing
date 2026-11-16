import {uiLanguage,t} from './app-language.js';
import {fc,foodQuantityUnit} from './food-cloud-messages.js';
import {request} from './diary-api.js';
import {escape as e} from './html.js';
import {mountFoodPicker} from './food-picker.js';
import {quantityFields,quantityValue} from './quantity.js';

/** Dictation produces text only; matching and saving remain explicit actions. */
export function dictateText({signal,onStart=()=>{},language=uiLanguage()}){
 return new Promise((resolve,reject)=>{
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech)return reject(Error(fc("voiceUnavailable")));
  if(signal.aborted)return reject(signal.reason);
  const recognition=new Speech();let settled=false;
  const finish=(error,text=null)=>{if(settled)return;settled=true;signal.removeEventListener('abort',cancel);recognition.onstart=recognition.onresult=recognition.onerror=recognition.onend=null;try{recognition.abort();}catch{}error?reject(error):resolve(text);};
  const cancel=()=>finish(signal.reason??new DOMException(fc("cancelled"),'AbortError'));
  recognition.lang=language;recognition.interimResults=false;
  recognition.onstart=onStart;
  recognition.onresult=event=>{const result=event.results?.[event.resultIndex??0];if(result?.isFinal===false)return;const transcript=result?.[0]?.transcript;if(typeof transcript==='string')finish(null,transcript);};
  recognition.onerror=()=>finish(Error(fc("voiceFailed")));
  recognition.onend=()=>finish(null);signal.addEventListener('abort',cancel,{once:true});
  try{recognition.start();}catch(error){finish(error);}
 });
}
const quantityLabel=quantity=>!quantity?fc("setAmount"):`${quantity.quantity??quantity.amount} ${foodQuantityUnit(quantity.unit==='portion'?'portions':quantity.unit??'servings')}`;
export function mountTextLog({show,close,header,content,date,groups,initialGroup,onChange=async()=>{}}){
 let disposed=false,serial=0,abort,speech,pickerCleanup,pendingSave=false,saveEnvelope=null,screen='start',originalText='',rows=[],revision;
 const clock=new Date();let diaryDate=typeof date==='function'?date():date,time=clock.toTimeString().slice(0,5),group=groups.includes(initialGroup)?initialGroup:groups.includes('Uncategorized')?'Uncategorized':groups[0];
 show(`<section class="text-log">${header(fc("textVoiceLog"))}<div class="text-log-body"></div></section>`);
 const shell=content.querySelector('.text-log'),body=shell.querySelector('.text-log-body'),alive=()=>!disposed&&shell.isConnected;
 function dispose(){if(disposed)return;disposed=true;serial++;abort?.abort();speech?.abort();pickerCleanup?.();observer.disconnect();rows=[];originalText='';}
 const observer=new MutationObserver(()=>{if(!shell.isConnected)dispose();});observer.observe(content,{childList:true,subtree:true});
 function replace(html){pickerCleanup?.();pickerCleanup=null;speech?.abort();speech=null;body.innerHTML=html;}
 function start(){
  screen='start';
  replace(`<form class="text-log-input"><label>${e(fc("foodsAmounts"))}<textarea name="foods" maxlength="10000" required placeholder="${e(fc('textExample'))}">${e(originalText)}</textarea></label><small>${e(fc("oneFoodPerLine"))}</small><div class="entry-actions">${window.SpeechRecognition||window.webkitSpeechRecognition?`<button type="button" data-dictate>${e(fc("speak"))}</button>`:''}<button class="primary">${e(fc("findFoods"))}</button></div><p class="sheet-message" role="status"></p></form>`);
  const form=body.querySelector('form'),input=form.elements.foods,status=form.querySelector('[role=status]'),speak=form.querySelector('[data-dictate]');
  input.oninput=()=>originalText=input.value;
  if(speak)speak.onclick=async()=>{if(speech){speech.abort();return;}const controller=new AbortController();speech=controller;speak.textContent=fc("stop");try{const text=await dictateText({signal:controller.signal,onStart:()=>{if(form.isConnected)status.textContent=t("foodLog.listening");}});if(alive()&&form.isConnected&&text){input.value=[input.value.trim(),text].filter(Boolean).join('\n');originalText=input.value;}}catch(error){if(error.name!=='AbortError'&&alive()&&form.isConnected)status.textContent=error.message;}finally{if(speech===controller)speech=null;if(form.isConnected){speak.textContent=fc("speak");if(status.textContent===t('foodLog.listening'))status.textContent='';}}};
  form.onsubmit=async event=>{event.preventDefault();if(!form.reportValidity())return;speech?.abort();originalText=input.value;abort?.abort();abort=new AbortController();const id=++serial;form.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent=fc("matchingFoods");try{const result=await request('/api/text-log/parse',{originalText},abort.signal);if(!alive()||id!==serial||!form.isConnected)return;rows=result.rows;revision=result.revision;review();}catch(error){if(alive()&&id===serial&&form.isConnected&&error.name!=='AbortError'){status.textContent=error.message;form.querySelectorAll('button').forEach(b=>b.disabled=false);}}};
 }
 function review(){
  screen='review';
  const ready=rows.length&&rows.every(row=>row.foodId&&row.quantity&&!row.needsReview);
  replace(`<button type="button" class="more-results" data-edit-text>${e(fc("editText"))}</button><ul class="text-log-results">${rows.map((row,index)=>`<li><div><strong>${e(row.name)}</strong><small>${e(row.phrase??'')}</small><button type="button" data-quantity="${index}">${!row.foodId?fc("chooseMatch"):row.needsReview?fc("checkMatchAmount"):e(quantityLabel(row.quantity))}</button></div><button type="button" class="icon-button" data-replace="${index}" aria-label="${e(fc('replaceName',{name:row.name}))}">↻</button><button type="button" class="icon-button" data-remove="${index}" aria-label="${e(fc('removeName',{name:row.name}))}">×</button></li>`).join('')}</ul><button type="button" class="more-results" data-add>${e(fc("searchMore"))}</button><label class="field-row"><span>${e(t("mobileRepeat.group"))}</span><select name="group" aria-label="${e(t("mobileRepeat.group"))}">${groups.map(value=>`<option ${value===group?'selected':''}>${e(value)}</option>`).join('')}</select></label><details class="text-log-timing"><summary>${e(fc("dateTime"))}</summary><label class="field-row"><span>${e(t("mobileFood.date"))}</span><input name="date" aria-label="${e(t("mobileFood.date"))}" type="date" value="${e(diaryDate)}"></label><label class="field-row"><span>${e(t("appActions.time"))}</span><input name="time" aria-label="${e(t("appActions.time"))}" type="time" value="${e(time)}"></label></details><p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" class="primary" data-save ${ready?'':'disabled'}>${e(t("libraryView.addToDiary"))}</button></footer>`);
  body.querySelector('[data-edit-text]').onclick=start;
  for(const name of ['group','date','time'])body.querySelector(`[name=${name}]`).onchange=event=>{if(name==='group')group=event.target.value;else if(name==='date')diaryDate=event.target.value;else time=event.target.value;};
  body.querySelectorAll('[data-quantity]').forEach(b=>b.onclick=()=>{const index=Number(b.dataset.quantity);rows[index].foodId?edit(index):choose(index);});
  body.querySelectorAll('[data-replace]').forEach(b=>b.onclick=()=>choose(Number(b.dataset.replace)));
  body.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{rows.splice(Number(b.dataset.remove),1);review();});
  body.querySelector('[data-add]').onclick=()=>choose();
  body.querySelector('[data-save]').onclick=async()=>{
   if(pendingSave)return;pendingSave=true;const status=body.querySelector('[role=status]'),save=body.querySelector('[data-save]');body.querySelectorAll('button,input,select').forEach(b=>b.disabled=true);
   saveEnvelope??={revision,type:'text.log',requestId:crypto.randomUUID(),payload:{originalText,date:diaryDate,time,group,rows:rows.map(row=>({foodId:row.foodId,...row.quantity,...(row.lineIndex!==undefined?{lineIndex:row.lineIndex}:{}),confirmed:true}))}};
   let committed=false;
   try{const result=await request('/api/workspace/command',saveEnvelope);if(result.ok!==true)throw Error(fc("saveUnconfirmedShort"));committed=true;saveEnvelope=null;await onChange();if(alive()){dispose();close();}}
   catch(error){if(alive()&&status.isConnected){
    if(committed){dispose();close();return;}
    if(error.status>=400&&error.status<500){saveEnvelope=null;status.textContent=error.message;body.querySelectorAll('button,input,select').forEach(b=>b.disabled=false);if(error.status===409){save.disabled=true;status.textContent=fc("diaryChanged");const reload=document.createElement('button');reload.type='button';reload.textContent=fc("matchAgain");reload.onclick=start;status.append(reload);}}
    else{status.textContent=error.message;save.disabled=false;save.textContent=t("multiAdd.retry");}
   }}finally{pendingSave=false;}
  };
 }
 function choose(index){
  screen='child';
  const candidates=rows[index]?.candidates??[];
  replace(`<div class="text-candidates">${candidates.map((candidate,i)=>`<button type="button" class="more-results" data-candidate="${i}">${e(candidate.name)} · ${e(candidate.serving??'')}</button>`).join('')}</div><div class="text-food-picker"></div><button type="button" class="more-results" data-back>${e(t("mobileFoodEditor.back"))}</button>`);
  body.querySelectorAll('[data-candidate]').forEach(b=>b.onclick=()=>edit(index,candidates[Number(b.dataset.candidate)].ref.id));
  body.querySelector('[data-back]').onclick=review;const root=body.querySelector('.text-food-picker');pickerCleanup=mountFoodPicker(root,{allowMeals:false,allowRecipes:false,onPick:(kind,id)=>{if(kind==='food')edit(index,id);}});
 }
 async function edit(index,replacementId=null){
  screen='child';
  const row=rows[index]??{};replace(`<p class="empty">${e(t("mobileNutrientDetail.loading"))}</p>`);const loading=body.querySelector('.empty');
  try{const item=await request('/api/library/item?'+new URLSearchParams({kind:'food',id:replacementId??row.foodId}));if(!alive()||!loading.isConnected)return;
   const quantity=replacementId&&replacementId!==row.foodId?{amount:1}:row.quantity??{amount:1};
   replace(`<form class="entry-form"><strong>${e(item.resource.name)}</strong>${quantityFields(item.options,quantity)}<footer class="entry-actions"><button type="button" data-back>${e(t("mobileFoodEditor.back"))}</button><button class="primary">${e(t("mobileExpenditure.done"))}</button></footer></form>`);const form=body.querySelector('form');form.elements.amount.min='0.000001';form.querySelector('[data-back]').onclick=review;
   form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;const next={...row,name:item.resource.name,foodId:item.resource.id,quantity:quantityValue(form),needsReview:false};if(index===undefined)rows.push(next);else rows[index]=next;review();};
  }catch(error){if(alive()&&loading.isConnected){loading.textContent=error.message;const back=document.createElement('button');back.type='button';back.textContent=t("mobileFoodEditor.back");back.onclick=review;body.append(back);}}
 }
 start();return {dispose,back(){if(screen!=='child')return false;review();return true;}};
}
