import {nutrientDisplayName} from './report-source/public/nutrient-language.js';
import {chartMetricLabel} from './charts-source-view.js';
import {dc} from './discover-cloud-messages.js';
import {uiLanguage,t} from './app-language.js';
import {request} from './diary-api.js';
import {escape as e} from './html.js';
import {openProfileEditor,profileSexLabel} from './profile-editor.js';
import {ensureDeviceSnapshot} from './device-sync.js';
import {moreBackHeader} from './more-source/menu-view.js';

const options=(rows,value)=>rows.map(([id,label])=>`<option value="${e(id)}" ${String(id)===String(value)?'selected':''}>${e(label)}</option>`).join('');
const select=(name,label,rows,value)=>`<label class="field-row"><span>${e(label)}</span><select name="${name}" aria-label="${e(label)}">${options(rows,value)}</select></label>`;
const field=(name,label,value,type='number')=>`<label class="field-row"><span>${e(label)}</span><input name="${name}" aria-label="${e(label)}" type="${type}" value="${e(value??'')}" ${type==='number'?'min="0" step="any" inputmode="decimal"':''}></label>`;
const check=(name,label,value)=>`<label class="field-row"><span>${e(label)}</span><input name="${name}" aria-label="${e(label)}" type="checkbox" ${value?'checked':''}></label>`;
const number=(form,name)=>form.elements[name].value===''?null:Number(form.elements[name].value);
const display=value=>value===null||value===undefined?t('threshold.target.notSet'):Number(value).toLocaleString(uiLanguage(),{maximumFractionDigits:1});

/** Profile is a projection of explicitly configured policies and measurement series. */
export function mountProfile({page,headerRoot,initialField,...ui}){
 void ensureDeviceSnapshot().catch(()=>{});
 let disposed=false,data,editor;const abort=new AbortController(),root=document.createElement('section');root.className='profile-page';page.replaceChildren(root);
 const alive=()=>!disposed&&root.isConnected,date=()=>typeof ui.date==='function'?ui.date():ui.date;
 if(headerRoot)headerRoot.innerHTML=moreBackHeader(t('settings.profile'));
 async function load(fresh=false){root.setAttribute('aria-busy','true');try{const apply=value=>{if(alive()){data=value;render();if(initialField){const field=initialField;initialField=null;editField(field);}}};apply(await request('/api/profile-settings?date='+encodeURIComponent(date()),null,abort.signal,{fresh,onRefresh:value=>{if(!editor)apply(value);}}));}catch(error){if(alive()){root.innerHTML='<p class="empty" role="status">'+e(error.message)+`</p><button class="profile-retry" data-profile-reload>${t('mobileSuggest.retry')}</button>`;}}finally{if(alive())root.setAttribute('aria-busy','false');}}
 const changed=async next=>{if(next){data=next;if(alive())render();void ui.onChange?.();return;}await ui.onChange?.();if(alive())await load(true);};
 function render(){
  const {demographics:d,measurements:m,bmi}=data.profile;
  const row=(id,label,value,extra='',editable=true)=>`<${editable?'button type="button"':'div'} class="profile-row" ${editable?'data-profile-row="'+id+'"':''}><strong>${label}</strong><span class="profile-value">${e(value)}${extra?'<small>'+e(extra)+'</small>':''}</span>${editable?'<span class="profile-chevron" aria-hidden="true">›</span>':''}</${editable?'button':'div'}>`;
  const value=kind=>m[kind].value===null?(m[kind].status==='unselected'?t('threshold.target.notSet'):m[kind].status==='empty'?dc('noReading'):t('health.unknown')):display(m[kind].value)+(m[kind].unit==='%'?'%':' '+m[kind].unit);
  root.innerHTML='<div class="profile-card">'+row('age',t('printDocument.stored.age'),display(d.age))+row('sex',dc('sex'),profileSexLabel(d))+row("weight",t('measurementCatalog.metric.weight'),value("weight"))+row("height",t('measurementCatalog.metric.height'),value("height"))+row('bmi',dc('bmi'),display(bmi),'',false)+row('bodyFat',t('measurementCatalog.metric.body-fat'),value('bodyFat'),m.bodyFat.date?dc('lastUpdated',{date:m.bodyFat.date}):'')+'</div>';
 }
 function editField(kind){if(!kind||!data)return;editor?.dispose();editor=openProfileEditor({kind,data,date:date(),onSaved:changed,onClose:()=>{editor=null;}});}
 root.addEventListener('click',event=>{if(event.target.closest('[data-profile-reload]'))return void load(true);editField(event.target.closest('[data-profile-row]')?.dataset.profileRow);},{signal:abort.signal});
 root.textContent=t('mobileNutrientDetail.loading');void load();return {back(){if(editor){editor.close();return true;}return false;},dispose(){disposed=true;abort.abort();editor?.dispose();}};
}

export async function openProfileSettings({date,show,close,header,content,onChange=async()=>{},initialScreen,onDone}){
 const selectedDate=typeof date==='function'?date():date;let data;
 const read=async()=>{data=await request('/api/profile-settings?date='+encodeURIComponent(selectedDate));};
 show(`${header(dc('profileBody'))}<p class="empty">${t('mobileNutrientDetail.loading')}</p>`);const loading=content.lastElementChild;
 try{await read();if(loading.isConnected)({energy:energyEditor,references:referenceEditor,body:bodyEditor}[initialScreen]??menu)();}catch(error){if(loading.isConnected)loading.textContent=error.message;}
 function menu(){
  show(`${header(dc('profileBody'))}<section class="profile-summary"><strong>${display(data.effectiveEnergy.components.resting)}${data.effectiveEnergy.components.resting===null?'':' kcal'}</strong><span>${t('energySummary.resting')}</span></section><div class="profile-menu">${[["energy",dc('bodyActivity')],['references',dc('nutrientReferences')],['body',dc('useMeasurements')]].map(([key,label])=>`<button type="button" data-profile="${key}">${label}<span>›</span></button>`).join('')}</div>`);
  content.querySelectorAll('[data-profile]').forEach(button=>button.onclick=()=>({energy:energyEditor,references:referenceEditor,body:bodyEditor})[button.dataset.profile]());
 }
 function editor(title,html,build){
  show(`${header(title)}<form class="profile-form">${html}<p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" data-back>${t('discover.back')}</button><button type="submit" class="primary">${t('common.save')}</button></footer></form>`);
  const form=content.querySelector('form');let pending=null,conflict=false;form.querySelector('[data-back]').onclick=onDone?close:menu;
  form.onsubmit=async event=>{event.preventDefault();if(form.dataset.saving)return;form.dataset.saving='yes';const status=form.querySelector('[role=status]');status.replaceChildren();form.querySelectorAll('button').forEach(button=>button.disabled=true);
   try{if(!pending){const action=build(form);pending={requestId:crypto.randomUUID(),revision:data.revision,type:action.type,payload:structuredClone(action.payload)};}for(const input of form.querySelectorAll('input,select'))input.disabled=true;await request('/api/workspace/command',pending);await onChange();await read();if(form.isConnected)(onDone??menu)();}
   catch(error){if(error.status>=400&&error.status<500&&error.status!==408)pending=null;conflict=error.status===409;if(form.isConnected){status.textContent=error.message;if(conflict){const reload=document.createElement('button');reload.type='button';reload.textContent=dc('reloadSettings');reload.dataset.profileReload='';reload.onclick=async()=>{try{await onChange();await read();if(form.isConnected)(onDone??menu)();}catch(error){if(form.isConnected)status.textContent=error.message;}};status.append(reload);}}}
   finally{delete form.dataset.saving;form.querySelectorAll('button').forEach(button=>button.disabled=conflict&&button.type==='submit');for(const input of form.querySelectorAll('input,select'))input.disabled=Boolean(pending)||conflict;form.querySelector('[type=submit]').textContent=pending?t('mobileSuggest.retry'):t('common.save');}
  };return form;
 }
 function energyEditor(){
  const resting=data.energy?.resting??{mode:'mifflin-st-jeor-birthday'},baseline=data.energy?.baseline??{mode:'multiplier',factor:0};
  const form=editor(dc('bodyActivity'),select('mode',t('energySummary.resting'),[['mifflin-st-jeor-birthday',dc('equationBirthDate')],['mifflin-st-jeor',dc('equationAge')],["custom",dc('customCalories')]],resting.mode)+
   `<div data-equation>${select('sex',dc('equationSex'),[['',dc('choose')],["male",dc('male')],["female",dc('female')]],resting.sex??'')}<div data-birthday>${field('birthDate',t('referencePanel.birthDate'),resting.birthDate,'date')}</div><div data-age>${field('age',t('printDocument.stored.age'),resting.age)}</div>${field("height",t('printDocument.stored.height'),resting.heightCm)}${field("weight",t('printDocument.stored.weight'),resting.weightKg)}${check('scope',dc('adultEquation'),resting.adultScope)}</div><div data-custom>${field('kcal',dc('restingKcal'),resting.kcal)}</div>`+
   select('baseline',t('energySummary.baseline'),[['multiplier',dc('activityLevel')],["custom",dc('customCalories')]],baseline.mode)+`<div data-factor>${select('factor',dc('activityLevel'),[['0',t('healthReconciliation.none')],['0.2',t('mobileExpenditure.activityName.sedentary')],['0.375',dc('lightActivity')],['0.5',dc('moderateActivity')],['0.9',t('targetSetup.veryActive')]],baseline.factor??0)}</div><div data-activity-kcal>${field('activityKcal',dc('activityKcal'),baseline.kcal)}</div>`,form=>{
    const mode=form.elements.mode.value,resting=mode==="custom"?{mode,kcal:number(form,'kcal')}:{mode,adultScope:form.elements.scope.checked,sex:form.elements.sex.value,...(mode==='mifflin-st-jeor'?{age:number(form,'age')}:{birthDate:form.elements.birthDate.value}),heightCm:number(form,"height"),weightKg:number(form,"weight")};
    const baseline=form.elements.baseline.value==="custom"?{mode:"custom",kcal:number(form,'activityKcal')}:{mode:'multiplier',factor:Number(form.elements.factor.value)};
    return {type:'profileSettings.energy',payload:{resting,baseline}};
   });
  const toggle=()=>{const mode=form.elements.mode.value;form.querySelector('[data-equation]').hidden=mode==="custom";form.querySelector('[data-custom]').hidden=mode!=="custom";form.querySelector('[data-age]').hidden=mode!=='mifflin-st-jeor';form.querySelector('[data-birthday]').hidden=mode!=='mifflin-st-jeor-birthday';form.querySelector('[data-factor]').hidden=form.elements.baseline.value!=='multiplier';form.querySelector('[data-activity-kcal]').hidden=form.elements.baseline.value!=="custom";};form.elements.mode.onchange=toggle;form.elements.baseline.onchange=toggle;toggle();
 }
 function referenceEditor(){
  const policy=data.references;
  const form=editor(dc('nutrientReferences'),check('enabled',dc('useReferences'),Boolean(policy))+`<div data-references>${field('birthDate',t('referencePanel.birthDate'),policy?.birthDate,'date')}${select('sex',t('referencePanel.sex'),[['',dc('choose')],["male",dc('male')],["female",dc('female')]],policy?.sex??'')}${select('stage',t('referencePanel.lifeStage'),[["standard",t('referencePanel.standard')],["pregnant",t('referencePanel.pregnant')],["lactating",dc('breastfeeding')]],policy?.lifeStage??"standard")}<details class="profile-nutrients"><summary>${t('foodQuality.nutrients')} <span data-count></span></summary>${data.referenceOptions.map(option=>check('nutrient_'+option.id,nutrientDisplayName(option,uiLanguage()),policy?.nutrients.includes(option.id))).join('')}</details></div>`,form=>({type:'profileSettings.references',payload:{policy:form.elements.enabled.checked?{version:1,referenceSet:data.referenceSet,birthDate:form.elements.birthDate.value,sex:form.elements.sex.value,lifeStage:form.elements.stage.value,nutrients:data.referenceOptions.filter(row=>form.elements['nutrient_'+row.id].checked).map(row=>row.id)}:null}}));
  const toggle=()=>{form.querySelector('[data-references]').hidden=!form.elements.enabled.checked;form.querySelector('[data-count]').textContent=data.referenceOptions.filter(row=>form.elements['nutrient_'+row.id].checked).length;};form.onchange=toggle;toggle();
 }
 function bodyEditor(){
  const policy=data.body,metricOptions=kind=>[['',t('healthReconciliation.none')],...data.bodyOptions[kind].map((row,index)=>[String(index),`${chartMetricLabel(row)} (${row.unit})`])],selected=(kind,metric)=>metric?String(data.bodyOptions[kind].findIndex(row=>JSON.stringify(row.metric)===JSON.stringify(metric))):'';
  const form=editor(dc('recordedMeasurements'),check('enabled',dc('useMeasurements'),Boolean(policy))+`<div data-body>${select("weight",t('measurementCatalog.metric.weight'),metricOptions("weight"),selected("weight",policy?.weightMetric))}${check('useWeight',dc('weightResting'),policy?.useForResting)}${select("height",t('measurementCatalog.metric.height'),metricOptions("height"),selected("height",policy?.heightMetric))}${check('useHeight',dc('heightResting'),policy?.useHeightForResting)}${select('bodyFat',t('bodyPanel.bodyFat'),metricOptions('bodyFat'),selected('bodyFat',policy?.bodyFatMetric))}${check('useKeto',dc('ketoMeasurements'),policy?.useForKeto)}</div>`,form=>{
   const metric=kind=>form.elements[kind].value===''?null:data.bodyOptions[kind][Number(form.elements[kind].value)].metric;
   return {type:'profileSettings.body',payload:{policy:form.elements.enabled.checked?{version:2,weightMetric:metric("weight"),heightMetric:metric("height"),bodyFatMetric:metric('bodyFat'),useForResting:form.elements.useWeight.checked,useHeightForResting:form.elements.useHeight.checked,useForKeto:form.elements.useKeto.checked}:null}};
  });const toggle=()=>{form.querySelector('[data-body]').hidden=!form.elements.enabled.checked;};form.elements.enabled.onchange=toggle;toggle();
 }
}
