import {WheelColumn} from './fasting-source/mobile-datetime-picker.js';
import {uiLanguage,t} from './app-language.js';
import {dc} from './discover-cloud-messages.js';
import {escape as e} from './html.js';
import {queueCommand} from './diary-api.js';
import {localWorkspaceState} from './local-engine.js';
import {ensureDeviceSnapshot} from './device-sync.js';
import {projectProfileEdit} from './profile-local.js';

const labels={en:{birthday:'Birthday',month:'Month',day:'Day',year:'Year',kg:'Kilograms',lb:'Pounds'},fr:{birthday:'Date de naissance',month:'Mois',day:'Jour',year:'Année',kg:'Kilogrammes',lb:'Livres'},de:{birthday:'Geburtstag',month:'Monat',day:'Tag',year:'Jahr',kg:'Kilogramm',lb:'Pfund'},'pt-BR':{birthday:'Data de nascimento',month:'Mês',day:'Dia',year:'Ano',kg:'Quilogramas',lb:'Libras'}};
const referenceNote={
 en:'Nutrition reference tables use sex and life stage. If you are transitioning, your healthcare professional can help you choose a reference and set nutrient targets that fit your needs.',
 fr:'Les apports nutritionnels de référence dépendent du sexe et du stade de vie. En cas de transition de genre, votre professionnel de santé peut vous aider à choisir une référence et à personnaliser vos objectifs.',
 de:'Nährstoffreferenzwerte richten sich nach Geschlecht und Lebensphase. Wenn Sie sich in einer Transition befinden, können Sie gemeinsam mit Ihrer medizinischen Fachperson passende Referenzwerte und Ziele wählen.',
 'pt-BR':'As referências nutricionais consideram o sexo e a fase da vida. Se você estiver em transição de gênero, seu profissional de saúde pode ajudar a escolher uma referência e definir metas individuais.'
};
const profileChoice=d=>d.sex==='female'&&['pregnant','lactating'].includes(d.lifeStage)?d.lifeStage:d.sex??'';
function choiceLabel(choice){
 if(choice==='pregnant')return t('referencePanel.pregnant');
 if(choice==='lactating')return dc('breastfeeding');
 return choice?dc(choice):t('threshold.target.notSet');
}
export const profileSexLabel=d=>choiceLabel(profileChoice(d));
const unitFactors={weight:{kg:1,lb:.45359237,lbs:.45359237,st:6.35029318},height:{cm:1,in:2.54,m:100,ft:30.48},bodyFat:{'%':1}};
const pad=n=>String(n).padStart(2,'0');
const weightSuffix=unit=>unit==='lb'?'lbs':unit;
/** A Profile field owns one compact dialog and one idempotent save. */
export function openProfileEditor({kind,data,date,onSaved,onClose}){
 const language=uiLanguage(),l=labels[language]??labels.en,focus=document.activeElement;
 const dialog=document.createElement('dialog');dialog.className='profile-editor';if(['age','weight','sex'].includes(kind))dialog.classList.add('settings-compact-dialog');dialog.dataset.profileEditor=kind;
 const title=kind==='age'?l.birthday:kind==='sex'?dc('sex'):t('measurementCatalog.metric.'+({weight:'weight',height:'height',bodyFat:'body-fat'}[kind]));
 dialog.setAttribute('aria-label',title);dialog.innerHTML=`<form><h2 tabindex="-1" autofocus>${e(title)}</h2><div class="profile-editor-fields"></div><p role="status" aria-live="polite"></p><footer><button type="button" data-profile-cancel>${e(t('common.cancel'))}</button><button type="submit">${e(t('common.save'))}</button></footer></form>`;
 const form=dialog.querySelector('form'),fields=dialog.querySelector('.profile-editor-fields'),status=dialog.querySelector('[role=status]');
 let closed=false,busy=false,pending=null,conflict=false;const wheels={};
 const wheel=(key,items,value,label,changed=()=>{})=>{const root=fields.querySelector(`[data-wheel="${key}"]`);wheels[key]=new WheelColumn({root,key:'profile-'+key,label,items,value,onChange:changed});return wheels[key];};
 const wheelMarkup=keys=>`<div class="profile-wheels profile-wheels-${keys.length}">${keys.map(k=>`<div data-wheel="${k}"></div>`).join('')}</div>`;
 let value,unit,parts;
 if(kind==='age'){
  const known=data.profile.demographics.birthDate;const initial=known??date;parts={year:known?Number(initial.slice(0,4)):'',month:known?Number(initial.slice(5,7)):'',day:known?Number(initial.slice(8,10)):''};
  fields.innerHTML=wheelMarkup(['month','day','year']);
 }else if(kind==='sex'){fields.innerHTML=wheelMarkup(['sex'])+`<p class="profile-reference-note">${e(referenceNote[language]??referenceNote.en)}</p>`;}
 else{const measurement=data.profile.measurements[kind];unit=measurement.unit??(kind==='weight'?'kg':kind==='height'?'cm':'%');value=measurement.value;
  const displayed=kind==='weight'&&Number.isInteger(value)?value.toFixed(1):value??'';
  const numberTag=kind==='weight'?'label':'div';
  fields.innerHTML=(kind==='height'?wheelMarkup(['height','unit']):kind==='bodyFat'?'':wheelMarkup(['unit']))+`<${numberTag} class="profile-number" ${kind==='height'?'hidden':''}><input name="value" type="number" inputmode="decimal" step="any" required min="${kind==='bodyFat'?0:.000001}" ${kind==='bodyFat'?'max="100"':''} aria-label="${e(title)}" value="${displayed}"><span data-profile-unit>${e(kind==='weight'?weightSuffix(unit):unit)}</span></${numberTag}>`;
 }
 document.body.append(dialog);dialog.showModal();
 if(kind==='age'){
  const blank={value:'',label:t('threshold.target.notSet')};
  const days=()=>Array.from({length:new Date(Date.UTC(parts.year||Number(date.slice(0,4)),parts.month||1,0)).getUTCDate()},(_,i)=>({value:i+1,label:String(i+1)}));
  const ready=()=>{form.querySelector('[type=submit]').disabled=!parts.year||!parts.month||!parts.day;};
  const refreshDays=()=>{if(parts.day)parts.day=Math.min(parts.day,days().length);wheels.day?.setItems([blank,...days()],parts.day);ready();};
  wheel('month',[blank,...Array.from({length:12},(_,i)=>({value:i+1,label:new Intl.DateTimeFormat(language,{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2000,i,1)))}))],parts.month,l.month,v=>{parts.month=v;refreshDays();});
  wheel('day',[blank,...days()],parts.day,l.day,v=>{parts.day=v;ready();});
  const year=Number(date.slice(0,4));wheel('year',[...Array.from({length:year},(_,i)=>({value:i+1,label:String(i+1)})),blank],parts.year,l.year,v=>{parts.year=v;refreshDays();});ready();
 }else if(kind==='sex'){
  const selected=profileChoice(data.profile.demographics),choices=['male','female','pregnant','lactating'];
  if(!selected)choices.unshift('');
  const save=form.querySelector('[type=submit]');save.disabled=!selected;
  wheel('sex',choices.map(value=>({value,label:choiceLabel(value)})),selected,dc('sex'),value=>{save.disabled=!value;});
 }
 else if(kind!=='bodyFat'){
  const units=kind==='weight'?[unit==='lbs'?'lbs':'lb','kg']:['cm','in'];if(!units.includes(unit))units.unshift(unit);
  const heights=()=>{const current=form.elements.value.value,limit=unit==='cm'?300:unit==='in'?120:unit==='m'?3:10;const items=Array.from({length:limit},(_,i)=>({value:String(i+1),label:String(i+1)}));if(current&&!items.some(x=>x.value===current))items.push({value:current,label:Number(current).toLocaleString(language,{maximumFractionDigits:1})});items.sort((a,b)=>Number(a.value)-Number(b.value));return [{value:'',label:t('threshold.target.notSet')},...items];};
  if(kind==='height')wheel('height',heights(),form.elements.value.value,title,v=>{form.elements.value.value=v;});
  wheel('unit',units.map(u=>({value:u,label:l[u==='lbs'?'lb':u]??u})),unit,t('mobileBiometric.unit'),next=>{const input=form.elements.value;if(input.value!==''){const converted=Number(input.value)*unitFactors[kind][unit]/unitFactors[kind][next];input.value=String(Number(converted.toFixed(6)));}unit=next;dialog.querySelector('[data-profile-unit]').textContent=kind==='weight'?weightSuffix(unit):unit;if(kind==='height')wheels.height.setItems(heights(),form.elements.value.value);});
 }
 function close(){if(closed||busy)return;closed=true;for(const item of Object.values(wheels))item.dispose();dialog.close();dialog.remove();if(focus?.isConnected)focus.focus({preventScroll:true});onClose?.();}
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('click',event=>{if(event.target.closest('[data-profile-cancel]'))close();if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
 function action(){
  if(kind==='age'){for(const key of ['year','month','day'])parts[key]=wheels[key].read();return {type:'profileSettings.demographic',payload:{field:'birthDate',value:`${String(parts.year).padStart(4,'0')}-${pad(parts.month)}-${pad(parts.day)}`,date}};}
  if(kind==='sex')return {type:'profileSettings.demographic',payload:{field:'sex',value:wheels.sex.read(),date}};
  if(kind==='height')form.elements.value.value=wheels.height.read();
  return {type:'profileSettings.measurement',payload:{kind,value:Number(form.elements.value.value),unit,date,time:new Date().toTimeString().slice(0,5)}};
 }
 form.onsubmit=async event=>{event.preventDefault();if(busy||conflict)return;busy=true;status.textContent='';
  try{const candidate=pending??{revision:data.revision,requestId:crypto.randomUUID(),...action()};form.querySelectorAll('button,input').forEach(n=>n.disabled=true);fields.inert=true;
   let state=await localWorkspaceState();if(!state){status.textContent=t('mobileNutrientDetail.loading');await ensureDeviceSnapshot();state=await localWorkspaceState();}
   const next=projectProfileEdit(data,candidate,state);pending=candidate;await queueCommand(pending.revision,pending.type,pending.payload,{requestId:pending.requestId,projection:{responses:{['/api/profile-settings?date='+encodeURIComponent(date)]:next}}});if(closed)return;busy=false;close();onSaved?.(next);}
  catch(error){if(closed)return;status.textContent=error.message;conflict=error.status===409;if(error.status>=400&&error.status<500&&error.status!==408)pending=null;
   if(conflict){const reload=document.createElement('button');reload.type='button';reload.textContent=dc('reloadSettings');reload.dataset.profileReload='';reload.onclick=async()=>{await onSaved?.();close();};status.append(reload);}
  }finally{busy=false;if(!closed){form.querySelectorAll('button').forEach(n=>n.disabled=false);form.querySelector('[type=submit]').disabled=conflict;form.querySelector('[type=submit]').textContent=pending?t('mobileSuggest.retry'):t('common.save');form.querySelectorAll('input').forEach(n=>n.disabled=Boolean(pending)||conflict);fields.inert=Boolean(pending)||conflict;}}
 };
 return {close,dispose(){busy=false;close();}};
}
