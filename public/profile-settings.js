import {request} from './diary-api.js';
import {escape as e} from './html.js';
import {mountRecordEditor} from './records.js';
import {AnchoredMenu} from './fasting-source/anchored-menu.js';
import {moreBackHeader} from './more-source/menu-view.js';

const options=(rows,value)=>rows.map(([id,label])=>`<option value="${e(id)}" ${String(id)===String(value)?'selected':''}>${e(label)}</option>`).join('');
const select=(name,label,rows,value)=>`<label class="field-row"><span>${e(label)}</span><select name="${name}" aria-label="${e(label)}">${options(rows,value)}</select></label>`;
const field=(name,label,value,type='number')=>`<label class="field-row"><span>${e(label)}</span><input name="${name}" aria-label="${e(label)}" type="${type}" value="${e(value??'')}" ${type==='number'?'min="0" step="any" inputmode="decimal"':''}></label>`;
const check=(name,label,value)=>`<label class="field-row"><span>${e(label)}</span><input name="${name}" aria-label="${e(label)}" type="checkbox" ${value?'checked':''}></label>`;
const number=(form,name)=>form.elements[name].value===''?null:Number(form.elements[name].value);
const display=value=>value===null||value===undefined?'Not set':Number(value).toLocaleString(undefined,{maximumFractionDigits:1});

/** Profile is a projection of explicitly configured policies and measurement series. */
export function mountProfile({page,headerRoot,...ui}){
 let disposed=false,data,menu;const abort=new AbortController(),root=document.createElement('section');root.className='profile-page';page.replaceChildren(root);
 const alive=()=>!disposed&&root.isConnected,date=()=>typeof ui.date==='function'?ui.date():ui.date;
 headerRoot.innerHTML=moreBackHeader('Profile');const more=document.createElement('button');more.type='button';more.className='profile-options';more.dataset.profileOptions='';more.setAttribute('aria-label','Profile options');more.textContent='⋮';headerRoot.querySelector('.mm-child-header>span').replaceWith(more);
 async function load(){root.setAttribute('aria-busy','true');try{data=await request('/api/profile-settings?date='+encodeURIComponent(date()),null,abort.signal);if(alive())render();}catch(error){if(alive()){root.innerHTML='<p class="empty" role="status">'+e(error.message)+'</p><button class="profile-retry" data-profile-reload>Try again</button>';}}finally{if(alive())root.setAttribute('aria-busy','false');}}
 const changed=async()=>{await ui.onChange?.();if(alive())await load();};
 function settings(screen){menu?.close();return openProfileSettings({...ui,date,initialScreen:screen,onChange:changed,onDone:ui.close});}
 function render(){
  const {demographics:d,measurements:m,bmi}=data.profile;
  const row=(id,label,value,extra='',editable=true)=>`<${editable?'button type="button"':'div'} class="profile-row" ${editable?'data-profile-row="'+id+'"':''}><strong>${label}</strong><span class="profile-value">${e(value)}${extra?'<small>'+e(extra)+'</small>':''}</span>${editable?'<span class="profile-chevron" aria-hidden="true">›</span>':''}</${editable?'button':'div'}>`;
  const value=kind=>m[kind].value===null?(m[kind].status==='unselected'?'Not set':m[kind].status==='empty'?'No reading':'Unknown'):display(m[kind].value)+(m[kind].unit==='%'?'%':' '+m[kind].unit);
  root.innerHTML='<div class="profile-card">'+row('age','Age',display(d.age))+row('sex','Sex',d.sex===null?'Not set':d.sex==='male'?'Male':'Female')+row('weight','Weight',value('weight'))+row('height','Height',value('height'))+row('bmi','Body Mass Index (BMI)',display(bmi),'',false)+row('bodyFat','Body Fat',value('bodyFat'),m.bodyFat.date?'Last updated '+m.bodyFat.date:'')+'</div>';
 }
 more.addEventListener('click',()=>{menu?.close();menu=new AnchoredMenu({origin:more,anchor:more,label:'Profile options',items:[{id:'energy',label:'Body & Activity'},{id:'references',label:'Nutrient References'},{id:'body',label:'Recorded Measurements'}],onChoose:settings,onClose:()=>{menu=null;}});},{signal:abort.signal});
 root.addEventListener('click',event=>{if(event.target.closest('[data-profile-reload]'))return void load();const id=event.target.closest('[data-profile-row]')?.dataset.profileRow;if(!id||!data)return;if(id==='age'||id==='sex')return void settings(id);const measurement=data.profile.measurements[id];if(!measurement?.choice)return void settings('body');void mountRecordEditor({...ui,date:date(),kind:'biometric',initialSelection:measurement.choice,onChange:changed});},{signal:abort.signal});
 root.textContent='Loading…';void load();return {back(){if(menu){menu.close();return true;}return false;},dispose(){disposed=true;abort.abort();menu?.close();more.remove();}};
}

export async function openProfileSettings({date,show,close,header,content,onChange=async()=>{},initialScreen,onDone}){
 const selectedDate=typeof date==='function'?date():date;let data;
 const read=async()=>{data=await request('/api/profile-settings?date='+encodeURIComponent(selectedDate));};
 show(`${header('Profile & Body')}<p class="empty">Loading…</p>`);const loading=content.lastElementChild;
 try{await read();if(loading.isConnected)({energy:energyEditor,references:referenceEditor,body:bodyEditor,age:()=>demographicEditor('age'),sex:()=>demographicEditor('sex')}[initialScreen]??menu)();}catch(error){if(loading.isConnected)loading.textContent=error.message;}
 function menu(){
  show(`${header('Profile & Body')}<section class="profile-summary"><strong>${display(data.effectiveEnergy.components.resting)}${data.effectiveEnergy.components.resting===null?'':' kcal'}</strong><span>Resting energy</span></section><div class="profile-menu">${[['energy','Body & activity'],['references','Nutrient references'],['body','Use recorded measurements']].map(([key,label])=>`<button type="button" data-profile="${key}">${label}<span>›</span></button>`).join('')}</div>`);
  content.querySelectorAll('[data-profile]').forEach(button=>button.onclick=()=>({energy:energyEditor,references:referenceEditor,body:bodyEditor})[button.dataset.profile]());
 }
 function editor(title,html,build){
  show(`${header(title)}<form class="profile-form">${html}<p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" data-back>Back</button><button type="submit" class="primary">Save</button></footer></form>`);
  const form=content.querySelector('form');let pending=null,conflict=false;form.querySelector('[data-back]').onclick=onDone?close:menu;
  form.onsubmit=async event=>{event.preventDefault();if(form.dataset.saving)return;form.dataset.saving='yes';const status=form.querySelector('[role=status]');status.replaceChildren();form.querySelectorAll('button').forEach(button=>button.disabled=true);
   try{if(!pending){const action=build(form);pending={requestId:crypto.randomUUID(),revision:data.revision,type:action.type,payload:structuredClone(action.payload)};}for(const input of form.querySelectorAll('input,select'))input.disabled=true;await request('/api/workspace/command',pending);await onChange();await read();if(form.isConnected)(onDone??menu)();}
   catch(error){if(error.status>=400&&error.status<500&&error.status!==408)pending=null;conflict=error.status===409;if(form.isConnected){status.textContent=error.message;if(conflict){const reload=document.createElement('button');reload.type='button';reload.textContent='Reload settings';reload.dataset.profileReload='';reload.onclick=async()=>{try{await onChange();await read();if(form.isConnected)(onDone??menu)();}catch(error){if(form.isConnected)status.textContent=error.message;}};status.append(reload);}}}
   finally{delete form.dataset.saving;form.querySelectorAll('button').forEach(button=>button.disabled=conflict&&button.type==='submit');for(const input of form.querySelectorAll('input,select'))input.disabled=Boolean(pending)||conflict;form.querySelector('[type=submit]').textContent=pending?'Try again':'Save';}
  };return form;
 }
 function demographicEditor(kind){
  const d=data.profile.demographics;if(!d.source)return energyEditor();
  const source=d.source==='energy'?data.energy.resting:data.references;
  const html=kind==='sex'?select('sex','Sex',[['male','Male'],['female','Female']],source.sex):source.birthDate?field('birthDate','Birth date',source.birthDate,'date'):field('age','Age',d.age);
  editor(kind==='age'?'Age':'Sex',html+`<p class="profile-source-note">Used for ${d.source==='energy'?'your resting energy estimate':'your nutrient references'}.</p>`,form=>{
   const patch=kind==='sex'?{sex:form.elements.sex.value}:source.birthDate?{birthDate:form.elements.birthDate.value}:{age:number(form,'age')};
   return d.source==='energy'?{type:'profileSettings.energy',payload:{resting:{...source,...patch},baseline:data.energy.baseline}}:{type:'profileSettings.references',payload:{policy:{...source,...patch}}};
  });
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
