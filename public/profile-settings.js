import {request,command} from './diary-api.js';
import {escape as e} from './html.js';

const options=(rows,value)=>rows.map(([id,label])=>`<option value="${e(id)}" ${String(id)===String(value)?'selected':''}>${e(label)}</option>`).join('');
const select=(name,label,rows,value)=>`<label class="field-row"><span>${e(label)}</span><select name="${name}" aria-label="${e(label)}">${options(rows,value)}</select></label>`;
const field=(name,label,value,type='number')=>`<label class="field-row"><span>${e(label)}</span><input name="${name}" aria-label="${e(label)}" type="${type}" value="${e(value??'')}" ${type==='number'?'min="0" step="any" inputmode="decimal"':''}></label>`;
const check=(name,label,value)=>`<label class="field-row"><span>${e(label)}</span><input name="${name}" aria-label="${e(label)}" type="checkbox" ${value?'checked':''}></label>`;
const number=(form,name)=>form.elements[name].value===''?null:Number(form.elements[name].value);
const display=value=>value===null||value===undefined?'Not set':Number(value).toLocaleString(undefined,{maximumFractionDigits:1});

export async function openProfileSettings({date,show,close,header,content,onChange=async()=>{},initialScreen}){
 const selectedDate=typeof date==='function'?date():date;let data;
 const read=async()=>{data=await request('/api/profile-settings?date='+encodeURIComponent(selectedDate));};
 show(`${header('Profile & Body')}<p class="empty">Loading…</p>`);const loading=content.lastElementChild;
 try{await read();if(loading.isConnected)({energy:energyEditor,references:referenceEditor,body:bodyEditor}[initialScreen]??menu)();}catch(error){if(loading.isConnected)loading.textContent=error.message;}
 function menu(){
  show(`${header('Profile & Body')}<section class="profile-summary"><strong>${display(data.effectiveEnergy.components.resting)}${data.effectiveEnergy.components.resting===null?'':' kcal'}</strong><span>Resting energy</span></section><div class="profile-menu">${[['energy','Body & activity'],['references','Nutrient references'],['body','Use recorded measurements']].map(([key,label])=>`<button type="button" data-profile="${key}">${label}<span>›</span></button>`).join('')}</div>`);
  content.querySelectorAll('[data-profile]').forEach(button=>button.onclick=()=>({energy:energyEditor,references:referenceEditor,body:bodyEditor})[button.dataset.profile]());
 }
 function editor(title,html,build){
  show(`${header(title)}<form class="profile-form">${html}<p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" data-back>Back</button><button type="submit" class="primary">Save</button></footer></form>`);
  const form=content.querySelector('form');form.querySelector('[data-back]').onclick=menu;
  form.onsubmit=async event=>{event.preventDefault();if(form.dataset.saving)return;form.dataset.saving='yes';const status=form.querySelector('[role=status]');status.replaceChildren();form.querySelectorAll('button').forEach(button=>button.disabled=true);
   try{const action=build(form);await command(data.revision,action.type,action.payload);await onChange();await read();if(form.isConnected)menu();}
   catch(error){if(form.isConnected){status.textContent=error.message;if(error.status===409){const reload=document.createElement('button');reload.type='button';reload.textContent='Reload settings';reload.onclick=async()=>{try{await read();if(form.isConnected)menu();}catch(error){if(form.isConnected)status.textContent=error.message;}};status.append(reload);}}}
   finally{delete form.dataset.saving;form.querySelectorAll('button').forEach(button=>button.disabled=false);}
  };return form;
 }
 function energyEditor(){
  const resting=data.energy?.resting??{mode:'mifflin-st-jeor-birthday'},baseline=data.energy?.baseline??{mode:'multiplier',factor:0};
  const form=editor('Body & Activity',select('mode','Resting energy',[['mifflin-st-jeor-birthday','Mifflin-St Jeor · birth date'],['mifflin-st-jeor','Mifflin-St Jeor · age'],['custom','Custom calories']],resting.mode)+
   `<div data-equation>${select('sex','Equation sex',[['','Choose'],['male','Male'],['female','Female']],resting.sex??'')}<div data-birthday>${field('birthDate','Birth date',resting.birthDate,'date')}</div><div data-age>${field('age','Age',resting.age)}</div>${field('height','Height (cm)',resting.heightCm)}${field('weight','Weight (kg)',resting.weightKg)}${check('scope','Healthy adult equation (19+)',resting.adultScope)}</div><div data-custom>${field('kcal','Resting energy (kcal)',resting.kcal)}</div>`+
   select('baseline','Baseline activity',[['multiplier','Activity level'],['custom','Custom calories']],baseline.mode)+`<div data-factor>${select('factor','Activity level',[['0','None'],['0.2','Sedentary'],['0.375','Lightly active'],['0.5','Moderately active'],['0.9','Very active']],baseline.factor??0)}</div><div data-activity-kcal>${field('activityKcal','Activity (kcal)',baseline.kcal)}</div>`,form=>{
    const mode=form.elements.mode.value,resting=mode==='custom'?{mode,kcal:number(form,'kcal')}:{mode,adultScope:form.elements.scope.checked,sex:form.elements.sex.value,...(mode==='mifflin-st-jeor'?{age:number(form,'age')}:{birthDate:form.elements.birthDate.value}),heightCm:number(form,'height'),weightKg:number(form,'weight')};
    const baseline=form.elements.baseline.value==='custom'?{mode:'custom',kcal:number(form,'activityKcal')}:{mode:'multiplier',factor:Number(form.elements.factor.value)};
    return {type:'profileSettings.energy',payload:{resting,baseline}};
   });
  const toggle=()=>{const mode=form.elements.mode.value;form.querySelector('[data-equation]').hidden=mode==='custom';form.querySelector('[data-custom]').hidden=mode!=='custom';form.querySelector('[data-age]').hidden=mode!=='mifflin-st-jeor';form.querySelector('[data-birthday]').hidden=mode!=='mifflin-st-jeor-birthday';form.querySelector('[data-factor]').hidden=form.elements.baseline.value!=='multiplier';form.querySelector('[data-activity-kcal]').hidden=form.elements.baseline.value!=='custom';};form.elements.mode.onchange=toggle;form.elements.baseline.onchange=toggle;toggle();
 }
 function referenceEditor(){
  const policy=data.references;
  const form=editor('Nutrient References',check('enabled','Use nutrient references',Boolean(policy))+`<div data-references>${field('birthDate','Birth date',policy?.birthDate,'date')}${select('sex','Reference sex',[['','Choose'],['male','Male'],['female','Female']],policy?.sex??'')}${select('stage','Life stage',[['standard','Standard'],['pregnant','Pregnant'],['lactating','Breastfeeding']],policy?.lifeStage??'standard')}<details class="profile-nutrients"><summary>Nutrients <span data-count></span></summary>${data.referenceOptions.map(option=>check('nutrient_'+option.id,option.name,policy?.nutrients.includes(option.id))).join('')}</details></div>`,form=>({type:'profileSettings.references',payload:{policy:form.elements.enabled.checked?{version:1,referenceSet:data.referenceSet,birthDate:form.elements.birthDate.value,sex:form.elements.sex.value,lifeStage:form.elements.stage.value,nutrients:data.referenceOptions.filter(row=>form.elements['nutrient_'+row.id].checked).map(row=>row.id)}:null}}));
  const toggle=()=>{form.querySelector('[data-references]').hidden=!form.elements.enabled.checked;form.querySelector('[data-count]').textContent=data.referenceOptions.filter(row=>form.elements['nutrient_'+row.id].checked).length;};form.onchange=toggle;toggle();
 }
 function bodyEditor(){
  const policy=data.body,metricOptions=kind=>[['','None'],...data.bodyOptions[kind].map((row,index)=>[String(index),`${row.name} (${row.unit})`])],selected=(kind,metric)=>metric?String(data.bodyOptions[kind].findIndex(row=>JSON.stringify(row.metric)===JSON.stringify(metric))):'';
  const form=editor('Recorded Measurements',check('enabled','Use recorded measurements',Boolean(policy))+`<div data-body>${select('weight','Weight',metricOptions('weight'),selected('weight',policy?.weightMetric))}${check('useWeight','Use weight for resting energy',policy?.useForResting)}${select('height','Height',metricOptions('height'),selected('height',policy?.heightMetric))}${check('useHeight','Use height for resting energy',policy?.useHeightForResting)}${select('bodyFat','Body fat',metricOptions('bodyFat'),selected('bodyFat',policy?.bodyFatMetric))}${check('useKeto','Use weight & body fat for Keto',policy?.useForKeto)}</div>`,form=>{
   const metric=kind=>form.elements[kind].value===''?null:data.bodyOptions[kind][Number(form.elements[kind].value)].metric;
   return {type:'profileSettings.body',payload:{policy:form.elements.enabled.checked?{version:2,weightMetric:metric('weight'),heightMetric:metric('height'),bodyFatMetric:metric('bodyFat'),useForResting:form.elements.useWeight.checked,useHeightForResting:form.elements.useHeight.checked,useForKeto:form.elements.useKeto.checked}:null}};
  });const toggle=()=>{form.querySelector('[data-body]').hidden=!form.elements.enabled.checked;};form.elements.enabled.onchange=toggle;toggle();
 }
}
