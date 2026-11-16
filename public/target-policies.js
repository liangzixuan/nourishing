import {escape as e} from './html.js';
import {request,command} from './diary-api.js';

const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const options=(rows,value)=>rows.map(([id,label])=>`<option value="${e(id)}" ${String(value)===String(id)?'selected':''}>${e(label)}</option>`).join('');
const select=(name,label,rows,value)=>`<label class="field-row"><span>${e(label)}</span><select name="${name}" aria-label="${e(label)}">${options(rows,value)}</select></label>`;
const input=(name,label,value,{type='number',min='0',required=false}={})=>`<label class="field-row"><span>${e(label)}</span><input name="${name}" aria-label="${e(label)}" type="${type}" ${type==='number'?`min="${min}" step="any"`:''} value="${e(value??'')}" ${required?'required':''}></label>`;
const check=(name,label,value)=>`<label class="field-row"><span>${e(label)}</span><input name="${name}" aria-label="${e(label)}" type="checkbox" ${value?'checked':''}></label>`;
const numeric=(form,name)=>form.elements[name].value===''?null:Number(form.elements[name].value);
const n=value=>Number.isFinite(value)?value.toLocaleString(undefined,{maximumFractionDigits:1}):'—';

function macroFields(macro){
 const fixed=macro.mode==='fixed'?macro.targets:{protein:100,carbohydrate:250,fat:65};
 const ratios=macro.mode==='ratios'?macro:{basis:'percent',values:{protein:25,carbohydrate:45,fat:30}};
 const keto=macro.mode==='keto'?macro:{program:'moderate',leanBodyMassKg:null,proteinPerKg:1.5,carbohydrateGrams:40,athleticBonus:true,proteinAddition:0};
 return select('macroMode','Macro targets',[['fixed','Fixed amounts'],['ratios','Ratios'],['keto','Keto']],macro.mode)+
 `<div data-macro-mode="fixed">${['protein','carbohydrate','fat'].map(id=>input('fixed_'+id,id==='carbohydrate'?'Carbohydrate (g)':id==='protein'?'Protein (g)':'Fat (g)',fixed[id])).join('')}</div>`+
 `<div data-macro-mode="ratios">${select('ratioBasis','Ratio basis',[['percent','Percent'],['kcal','Calories'],['grams','Grams']],ratios.basis)}${['protein','carbohydrate','fat'].map(id=>input('ratio_'+id,id==='carbohydrate'?'Carbohydrate ratio':id==='protein'?'Protein ratio':'Fat ratio',ratios.values[id])).join('')}</div>`+
 `<div data-macro-mode="keto">${select('ketoProgram','Keto program',[['rigorous','Rigorous'],['moderate','Moderate'],['relaxed','Relaxed'],['custom','Custom']],keto.program)}${input('leanMass','Lean body mass (kg)',keto.leanBodyMassKg)}${input('proteinPerKg','Protein per kg',keto.proteinPerKg)}${input('carbohydrateGrams','Carbohydrate target (g)',keto.carbohydrateGrams)}${check('athleticBonus','Athletic bonus',keto.athleticBonus)}${select('proteinAddition','Additional protein',[['0','None'],['25','25 g']],keto.proteinAddition)}</div>`;
}
function bindMacro(form,presets){
 const toggle=()=>form.querySelectorAll('[data-macro-mode]').forEach(row=>{row.hidden=row.dataset.macroMode!==form.elements.macroMode.value;});
 form.elements.macroMode.onchange=toggle;toggle();
 const locks=()=>{for(const key of ['proteinPerKg','carbohydrateGrams'])form.elements[key].readOnly=form.elements.ketoProgram.value!=='custom';};locks();
 form.elements.ketoProgram.onchange=()=>{const preset=presets[form.elements.ketoProgram.value];if(preset){form.elements.proteinPerKg.value=preset.proteinPerKg;form.elements.carbohydrateGrams.value=preset.carbohydrateGrams;form.elements.athleticBonus.checked=preset.athleticBonus;}locks();};
}
function readMacro(form){
 const mode=form.elements.macroMode.value;
 if(mode==='fixed')return {mode,targets:Object.fromEntries(['protein','carbohydrate','fat'].map(id=>[id,numeric(form,'fixed_'+id)]))};
 if(mode==='ratios')return {version:1,mode,basis:form.elements.ratioBasis.value,values:Object.fromEntries(['protein','carbohydrate','fat'].map(id=>[id,numeric(form,'ratio_'+id)]))};
 return {version:1,mode,program:form.elements.ketoProgram.value,leanBodyMassKg:numeric(form,'leanMass'),proteinPerKg:numeric(form,'proteinPerKg'),carbohydrateGrams:numeric(form,'carbohydrateGrams'),athleticBonus:form.elements.athleticBonus.checked,proteinAddition:Number(form.elements.proteinAddition.value)};
}

/** Opens the account's target controls in the app's existing dismissible sheet. */
export async function openTargetPolicies({date,show,close,header,content,onChange,initialScreen,onSource}){
 const selectedDate=typeof date==='function'?date():date;let data;
 show(`${header('Macro & Energy Targets')}<p class="empty">Loading…</p>`);const loading=content.firstElementChild;
 async function read(){data=await request('/api/target-policies?date='+selectedDate);}
 try{await read();if(!loading.isConnected)return;({weekdays:weekdayEditor,schedule:scheduleEditor,day:()=>templateEditor(null,selectedDate)}[initialScreen]??menu)();}catch(error){if(loading.isConnected)content.innerHTML=header('Macro & Energy Targets')+`<p class="sheet-message">${e(error.message)}</p>`;}
 function editor(title,html,submit){
  show(`${header(title)}<form class="entry-form target-policy-form">${html}<p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" data-back>Back</button><button class="primary" type="submit">Save</button></footer></form>`);
  const form=content.querySelector('form');form.querySelector('[data-back]').onclick=menu;
  form.onsubmit=async event=>{event.preventDefault();await save(form,()=>submit(form));};return form;
 }
 async function save(form,build){
  const status=form.querySelector('[role=status]');status.textContent='';form.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{const action=build();if(!action){menu();return;}await command(data.revision,action.type,action.payload);await onChange?.();await read();if(form.isConnected)menu();}
  catch(error){if(form.isConnected){status.textContent=error.message;if(error.status===409){const reload=document.createElement('button');reload.type='button';reload.textContent='Reload targets';reload.onclick=async()=>{await read();if(form.isConnected)menu();};status.append(reload);}}}
  finally{form.querySelectorAll('button').forEach(button=>button.disabled=false);}
 }
 function menu(){
  const labels={default:'Default targets',weekly:'Weekly template','daily-template':'Daily template','daily-custom':'Daily custom targets','daily-default':'Default targets'};
  show(`${header('Macro & Energy Targets')}<section class="policy-summary"><strong>${n(data.effective.energy.target)} kcal</strong><span>${e(selectedDate)} · ${e(labels[data.effective.assignment.source]??data.effective.assignment.source)}</span></section><div class="policy-menu">${[['macros','Macro & Energy Targets'],['weekdays','Weekday overrides'],['schedule','Macro scheduler']].map(([id,label])=>`<button type="button" data-policy="${id}" aria-label="${label}">${label}<span>›</span></button>`).join('')}</div>`);
  for(const button of content.querySelectorAll('[data-policy]'))button.onclick=()=>({macros:onSource,weekdays:weekdayEditor,schedule:scheduleEditor})[button.dataset.policy]();
 }
 function weekdayEditor(day=new Date(selectedDate+'T12:00:00Z').getUTCDay()){
  const values=data.weekday[day]??{},carb=data.carbohydrateId;
  const form=editor('Weekday overrides',select('weekday','Weekday',weekdays.map((name,i)=>[i,name]),day)+[['calories','Calories (kcal)'],['protein','Protein (g)'],[carb,'Carbohydrate (g)'],['fat','Fat (g)']].map(([id,label])=>input(id,label,values[id])).join('')+'<button type="button" class="more-results" data-clear>Use default targets</button>',form=>{const targets=Object.fromEntries(['calories','protein',carb,'fat'].map(id=>[id,numeric(form,id)]).filter(([id,value])=>value!==(values[id]??null)));return Object.keys(targets).length?{type:'targetPolicy.weekday',payload:{weekday:Number(form.elements.weekday.value),targets}}:null;});
  form.elements.weekday.onchange=()=>weekdayEditor(Number(form.elements.weekday.value));form.querySelector('[data-clear]').onclick=()=>save(form,()=>({type:'targetPolicy.weekday',payload:{weekday:day,targets:null}}));
 }
 function scheduleEditor(){
  const plan=data.plan,templateOptions=[['','Default targets'],...plan.templates.map(row=>[row.id,row.name])];
  show(`${header('Macro scheduler')}<form class="target-policy-form schedule-enabled">${check('enabled','Enable scheduler',plan.enabled!==false)}<p class="sheet-message" role="status"></p></form><section class="policy-section"><div class="section-actions"><h3>Templates</h3><button type="button" data-new-template>＋ Add</button></div>${plan.templates.map(row=>`<button type="button" class="target-row" data-template="${e(row.id)}">${e(row.name)}<span>›</span></button>`).join('')||'<p class="empty">No templates</p>'}</section><form class="target-policy-form schedule-week"><h3>Weekly schedule</h3>${input('from','Start date',data.today,{type:'date',required:true})}${weekdays.map((name,index)=>select('day'+index,name,templateOptions,data.week.days[index]??'')).join('')}<p class="sheet-message" role="status"></p><button class="primary">Save weekly schedule</button></form><form class="target-policy-form schedule-day"><h3>Day override</h3>${input('date','Date',selectedDate,{type:'date',required:true})}${select('selection','Targets',[['','Follow weekly schedule'],['default','Default targets'],['custom','Custom targets'],...plan.templates.map(row=>['template:'+row.id,row.name])],'')}<p class="sheet-message" role="status"></p><div class="policy-inline-actions"><button type="button" data-custom-day>Custom targets</button><button class="primary">Save day</button></div></form><button type="button" class="more-results" data-back>Back</button>`);
  const enabled=content.querySelector('.schedule-enabled');enabled.elements.enabled.onchange=()=>save(enabled,()=>({type:'targetPolicy.schedule',payload:{change:{kind:'enabled',enabled:enabled.elements.enabled.checked}}}));
  content.querySelector('[data-new-template]').onclick=()=>templateEditor();for(const button of content.querySelectorAll('[data-template]'))button.onclick=()=>templateEditor(plan.templates.find(row=>row.id===button.dataset.template));
  const week=content.querySelector('.schedule-week');week.onsubmit=event=>{event.preventDefault();save(week,()=>({type:'targetPolicy.schedule',payload:{change:{kind:'weekly',from:week.elements.from.value,days:weekdays.map((_,i)=>week.elements['day'+i].value||null)}}}));};
  const day=content.querySelector('.schedule-day');const syncDay=()=>{const selection=plan.days.find(row=>row.date===day.elements.date.value)?.selection;day.elements.selection.value=selection?.kind==='template'?'template:'+selection.id:selection?.kind==='default'?'default':selection?.kind==='custom'?'custom':'';day.querySelector('[data-custom-day]').textContent=selection?.kind==='custom'?'Edit custom targets':'Custom targets';};day.elements.date.onchange=syncDay;syncDay();
  day.onsubmit=event=>{event.preventDefault();if(day.elements.selection.value==='custom'){templateEditor(null,day.elements.date.value);return;}save(day,()=>{const value=day.elements.selection.value;return {type:'targetPolicy.schedule',payload:{change:{kind:'day',date:day.elements.date.value,selection:value===''?null:value==='default'?{kind:'default'}:{kind:'template',id:value.slice('template:'.length)}}}};});};
  day.querySelector('[data-custom-day]').onclick=()=>templateEditor(null,day.elements.date.value);content.querySelector('[data-back]').onclick=menu;
 }
 function templateEditor(template=null,day=null){
  const saved=day?data.plan.days.find(row=>row.date===day)?.selection:null;
  const settings=template?.settings??(saved?.kind==='custom'?saved.settings:{macro:data.macro,energy:{mode:'inherit'}});
  const id=template?.id??crypto.randomUUID();
  const form=editor(day?'Custom targets':template?'Edit template':'New template',
   (day?`<p class="target-owner">${e(day)}</p>`:input('name','Name',template?.name??'',{type:'text',required:true}))+macroFields(settings.macro)+select('templateEnergy','Energy target',[['inherit','Use default'],['fixed','Fixed calories']],settings.energy.mode)+`<div data-template-kcal>${input('templateKcal','Calories (kcal)',settings.energy.kcal??data.calories)}</div>`+(template?'<button type="button" class="more-results danger" data-delete-template>Delete template</button>':''),form=>{
    const settings={macro:readMacro(form),energy:form.elements.templateEnergy.value==='fixed'?{mode:'fixed',kcal:numeric(form,'templateKcal')}:{mode:'inherit'}};
    const change=day?{kind:'day',date:day,selection:{kind:'custom',settings}}:{kind:template?'template-update':'template-create',template:{id,name:form.elements.name.value.trim(),settings}};
    return {type:'targetPolicy.schedule',payload:{change}};
   });
  bindMacro(form,data.ketoPresets);const toggle=()=>form.querySelector('[data-template-kcal]').hidden=form.elements.templateEnergy.value!=='fixed';form.elements.templateEnergy.onchange=toggle;toggle();form.querySelector('[data-back]').onclick=scheduleEditor;
  if(template)form.querySelector('[data-delete-template]').onclick=()=>{const button=form.querySelector('[data-delete-template]');if(button.dataset.confirm!=='yes'){button.dataset.confirm='yes';button.textContent='Delete template and its assignments';return;}save(form,()=>({type:'targetPolicy.schedule',payload:{change:{kind:'template-delete',id:template.id}}}));};
 }
}
