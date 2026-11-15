import {request,command} from './diary-api.js';
import {escape as e} from './html.js';
import {mountFoodPicker} from './food-picker.js';
import {quantityFields,quantityValue} from './quantity.js';

/** Dictation produces text only; matching and saving remain explicit actions. */
export function dictateText({signal,onStart=()=>{},language=navigator.language}){
 return new Promise((resolve,reject)=>{
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech)return reject(Error('Voice input is unavailable. Type your foods below.'));
  if(signal.aborted)return reject(signal.reason);
  const recognition=new Speech();let settled=false;
  const finish=(error,text=null)=>{if(settled)return;settled=true;signal.removeEventListener('abort',cancel);recognition.onstart=recognition.onresult=recognition.onerror=recognition.onend=null;try{recognition.abort();}catch{}error?reject(error):resolve(text);};
  const cancel=()=>finish(signal.reason??new DOMException('Cancelled','AbortError'));
  recognition.lang=language;recognition.interimResults=false;
  recognition.onstart=onStart;
  recognition.onresult=event=>{const result=event.results?.[event.resultIndex??0];if(result?.isFinal===false)return;const transcript=result?.[0]?.transcript;if(typeof transcript==='string')finish(null,transcript);};
  recognition.onerror=()=>finish(Error('Voice input failed. Try again or type your foods.'));
  recognition.onend=()=>finish(null);signal.addEventListener('abort',cancel,{once:true});
  try{recognition.start();}catch(error){finish(error);}
 });
}
const quantityLabel=quantity=>!quantity?'Set amount':`${quantity.quantity??quantity.amount} ${quantity.unit==='portion'?'portions':quantity.unit??'servings'}`;
export function mountTextLog({show,close,header,content,date,groups,onChange=async()=>{}}){
 let disposed=false,serial=0,abort,speech,pickerCleanup,pendingSave=false,originalText='',rows=[],revision;
 const clock=new Date();let diaryDate=typeof date==='function'?date():date,time=clock.toTimeString().slice(0,5),group=groups.includes('Uncategorized')?'Uncategorized':groups[0];
 show(`<section class="text-log">${header('Text & Voice Log')}<div class="text-log-body"></div></section>`);
 const shell=content.querySelector('.text-log'),body=shell.querySelector('.text-log-body'),alive=()=>!disposed&&shell.isConnected;
 function dispose(){if(disposed)return;disposed=true;serial++;abort?.abort();speech?.abort();pickerCleanup?.();observer.disconnect();rows=[];originalText='';}
 const observer=new MutationObserver(()=>{if(!shell.isConnected)dispose();});observer.observe(content,{childList:true,subtree:true});
 function replace(html){pickerCleanup?.();pickerCleanup=null;speech?.abort();speech=null;body.innerHTML=html;}
 function start(){
  replace(`<form class="text-log-input"><label>Foods & amounts<textarea name="foods" maxlength="10000" required placeholder="150 g cooked rice&#10;100 g chicken">${e(originalText)}</textarea></label><small>One food per line</small><div class="entry-actions">${window.SpeechRecognition||window.webkitSpeechRecognition?'<button type="button" data-dictate>Speak</button>':''}<button class="primary">Find foods</button></div><p class="sheet-message" role="status"></p></form>`);
  const form=body.querySelector('form'),input=form.elements.foods,status=form.querySelector('[role=status]'),speak=form.querySelector('[data-dictate]');
  input.oninput=()=>originalText=input.value;
  if(speak)speak.onclick=async()=>{if(speech){speech.abort();return;}const controller=new AbortController();speech=controller;speak.textContent='Stop';try{const text=await dictateText({signal:controller.signal,onStart:()=>{if(form.isConnected)status.textContent='Listening…';}});if(alive()&&form.isConnected&&text){input.value=[input.value.trim(),text].filter(Boolean).join('\n');originalText=input.value;}}catch(error){if(error.name!=='AbortError'&&alive()&&form.isConnected)status.textContent=error.message;}finally{if(speech===controller)speech=null;if(form.isConnected){speak.textContent='Speak';if(status.textContent==='Listening…')status.textContent='';}}};
  form.onsubmit=async event=>{event.preventDefault();if(!form.reportValidity())return;speech?.abort();originalText=input.value;abort?.abort();abort=new AbortController();const id=++serial;form.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='Matching foods…';try{const result=await request('/api/text-log/parse',{originalText},abort.signal);if(!alive()||id!==serial||!form.isConnected)return;rows=result.rows;revision=result.revision;review();}catch(error){if(alive()&&id===serial&&form.isConnected&&error.name!=='AbortError'){status.textContent=error.message;form.querySelectorAll('button').forEach(b=>b.disabled=false);}}};
 }
 function review(){
  const ready=rows.length&&rows.every(row=>row.foodId&&row.quantity&&!row.needsReview);
  replace(`<button type="button" class="more-results" data-edit-text>Edit text</button><ul class="text-log-results">${rows.map((row,index)=>`<li><div><strong>${e(row.name)}</strong><small>${e(row.phrase??'')}</small><button type="button" data-quantity="${index}">${!row.foodId?'Choose a match':row.needsReview?'Check match & amount':e(quantityLabel(row.quantity))}</button></div><button type="button" class="icon-button" data-replace="${index}" aria-label="Replace ${e(row.name)}">↻</button><button type="button" class="icon-button" data-remove="${index}" aria-label="Remove ${e(row.name)}">×</button></li>`).join('')}</ul><button type="button" class="more-results" data-add>Search for more</button><label class="field-row"><span>Group</span><select name="group" aria-label="Group">${groups.map(value=>`<option ${value===group?'selected':''}>${e(value)}</option>`).join('')}</select></label><label class="field-row"><span>Date</span><input name="date" aria-label="Date" type="date" value="${e(diaryDate)}"></label><label class="field-row"><span>Time</span><input name="time" aria-label="Time" type="time" value="${e(time)}"></label><p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" class="primary" data-save ${ready?'':'disabled'}>Add to diary</button></footer>`);
  body.querySelector('[data-edit-text]').onclick=start;
  for(const name of ['group','date','time'])body.querySelector(`[name=${name}]`).onchange=event=>{if(name==='group')group=event.target.value;else if(name==='date')diaryDate=event.target.value;else time=event.target.value;};
  body.querySelectorAll('[data-quantity]').forEach(b=>b.onclick=()=>{const index=Number(b.dataset.quantity);rows[index].foodId?edit(index):choose(index);});
  body.querySelectorAll('[data-replace]').forEach(b=>b.onclick=()=>choose(Number(b.dataset.replace)));
  body.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{rows.splice(Number(b.dataset.remove),1);review();});
  body.querySelector('[data-add]').onclick=()=>choose();
  body.querySelector('[data-save]').onclick=async()=>{
   if(pendingSave)return;pendingSave=true;const status=body.querySelector('[role=status]');body.querySelectorAll('button,input,select').forEach(b=>b.disabled=true);
   try{await command(revision,'text.log',{originalText,date:diaryDate,time,group,rows:rows.map(row=>({foodId:row.foodId,...row.quantity,...(row.lineIndex!==undefined?{lineIndex:row.lineIndex}:{}),confirmed:true}))});await onChange();if(alive()&&status.isConnected){dispose();close();}}
   catch(error){if(alive()&&status.isConnected){status.textContent=error.message;body.querySelectorAll('button,input,select').forEach(b=>b.disabled=false);}}
   finally{pendingSave=false;}
  };
 }
 function choose(index){
  const candidates=rows[index]?.candidates??[];
  replace(`<div class="text-candidates">${candidates.map((candidate,i)=>`<button type="button" class="more-results" data-candidate="${i}">${e(candidate.name)} · ${e(candidate.serving??'')}</button>`).join('')}</div><div class="text-food-picker"></div><button type="button" class="more-results" data-back>Back</button>`);
  body.querySelectorAll('[data-candidate]').forEach(b=>b.onclick=()=>edit(index,candidates[Number(b.dataset.candidate)].ref.id));
  body.querySelector('[data-back]').onclick=review;const root=body.querySelector('.text-food-picker');pickerCleanup=mountFoodPicker(root,{allowMeals:false,allowRecipes:false,onPick:(kind,id)=>{if(kind==='food')edit(index,id);}});
 }
 async function edit(index,replacementId=null){
  const row=rows[index]??{};replace('<p class="empty">Loading…</p>');const loading=body.querySelector('.empty');
  try{const item=await request('/api/library/item?'+new URLSearchParams({kind:'food',id:replacementId??row.foodId}));if(!alive()||!loading.isConnected)return;
   const quantity=replacementId&&replacementId!==row.foodId?{amount:1}:row.quantity??{amount:1};
   replace(`<form class="entry-form"><strong>${e(item.resource.name)}</strong>${quantityFields(item.options,quantity)}<footer class="entry-actions"><button type="button" data-back>Back</button><button class="primary">Done</button></footer></form>`);const form=body.querySelector('form');form.elements.amount.min='0.000001';form.querySelector('[data-back]').onclick=review;
   form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;const next={...row,name:item.resource.name,foodId:item.resource.id,quantity:quantityValue(form),needsReview:false};if(index===undefined)rows.push(next);else rows[index]=next;review();};
  }catch(error){if(alive()&&loading.isConnected){loading.textContent=error.message;const back=document.createElement('button');back.type='button';back.textContent='Back';back.onclick=review;body.append(back);}}
 }
 start();return {dispose};
}
