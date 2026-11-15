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
export async function openTargetPolicies({date,show,close,header,content,onChange}){
 const selectedDate=typeof date==='function'?date():date;let data;
 show(`${header('Macro & Energy Targets')}<p class="empty">Loading…</p>`);const loading=content.firstElementChild;
 async function read(){data=await request('/api/target-policies?date='+selectedDate);}
 try{await read();if(!loading.isConnected)return;menu();}catch(error){if(loading.isConnected)content.innerHTML=header('Macro & Energy Targets')+`<p class="sheet-message">${e(error.message)}</p>`;}
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
  show(`${header('Macro & Energy Targets')}<section class="policy-summary"><strong>${n(data.effective.energy.target)} kcal</strong><span>${e(selectedDate)} · ${e(labels[data.effective.assignment.source]??data.effective.assignment.source)}</span></section><div class="policy-menu">${[['macros','Macro targets'],['energy','Energy target & expenditure'],['carbohydrate','Carbohydrate tracking'],['weekdays','Weekday overrides'],['schedule','Macro scheduler']].map(([id,label])=>`<button type="button" data-policy="${id}" aria-label="${label}">${label}<span>›</span></button>`).join('')}</div>`);
  for(const button of content.querySelectorAll('[data-policy]'))button.onclick=()=>({macros:macroEditor,energy:energyEditor,carbohydrate:carbohydrateEditor,weekdays:weekdayEditor,schedule:scheduleEditor})[button.dataset.policy]();
 }
 function macroEditor(){const form=editor('Macro targets',macroFields(data.macro),form=>({type:'targetPolicy.macros',payload:{macro:readMacro(form)}}));bindMacro(form,data.ketoPresets);}
 function carbohydrateEditor(){
  editor('Carbohydrate tracking',select('mode','Track carbohydrate',[['total','Total'],['net','Net']],data.carbohydrate.mode)+`<fieldset class="policy-fields"><legend>Net carbohydrate exclusions</legend>${[['fiber','Fiber'],['sugarAlcohol','Sugar alcohols'],['allulose','Allulose'],['fructose','Fructose']].map(([id,label])=>check(id,label,data.carbohydrate.netExcluded?.includes(id))).join('')}</fieldset>`,form=>{const mode=form.elements.mode.value,excluded=['fiber','sugarAlcohol','allulose','fructose'].filter(id=>form.elements[id].checked);return {type:'targetPolicy.carbohydrate',payload:{policy:{mode,netExcluded:mode==='total'&&data.carbohydrate.netExcluded===null&&excluded.length===0?null:excluded}}};});
 }
 function energyEditor(){
  const p=data.energyPolicy,resting=p?.resting??{mode:'custom',kcal:null},baseline=p?.baseline??{mode:'multiplier',factor:0.2},target=p?.target??{mode:'fixed',includeAboveBaseline:false},goal=target.mode==='weight-goal'?target.goal:{startDate:data.today,startWeight:null,goalWeight:null,unit:'kg',weeklyChange:null};
  const form=editor('Energy target & expenditure',
   select('restingMode','Resting energy',[['none','Not configured'],['custom','Custom'],['mifflin-st-jeor','Mifflin-St Jeor (age)'],['mifflin-st-jeor-birthday','Mifflin-St Jeor (birth date)']],p?resting.mode:'none')+
   `<div data-resting="custom">${input('restingKcal','Resting energy (kcal)',resting.kcal)}</div><div data-resting="equation">${check('adultScope','Adult equation (19+)',resting.adultScope??false)}${select('sex','Equation',[['male','Male'],['female','Female']],resting.sex??'male')}<div data-age>${input('age','Age',resting.age,{min:'19'})}</div><div data-birth>${input('birthDate','Birth date',resting.birthDate,{type:'date'})}</div>${input('heightCm','Height (cm)',resting.heightCm)}${input('weightKg','Weight (kg)',resting.weightKg)}</div>`+
   `<div data-expenditure>${select('baselineMode','Baseline activity',[['multiplier','Activity level'],['custom','Custom calories']],baseline.mode)}<div data-baseline-factor>${select('baselineFactor','Activity level',[['0','None'],['0.2','Sedentary'],['0.375','Lightly active'],['0.5','Moderately active'],['0.9','Very active']],baseline.factor??0.2)}</div><div data-baseline-kcal>${input('baselineKcal','Baseline activity (kcal)',baseline.kcal)}</div>${select('activityMode','Activity source',[['manual','Recorded exercise'],['health-connect','Health Connect']],p?.activity.mode??'manual')}<div data-device-zone>${input('zone','Health Connect time zone',p?.activity.zone??Intl.DateTimeFormat().resolvedOptions().timeZone,{type:'text'})}</div>${check('thermicEffect','Thermic effect of food',p?.thermicEffect??false)}</div>`+
   select('targetMode','Energy target',[['fixed','Fixed calories'],['calculated','Calculated'],['weight-goal','Weight goal']],target.mode)+
   `<div data-target="fixed">${input('kcal','Calorie target',data.calories)}</div><div data-target="calculated">${input('adjustment','Daily adjustment (kcal)',target.adjustmentKcal??0,{min:'-1000000'})}</div><div data-target="weight-goal">${input('startDate','Start date',goal.startDate,{type:'date'})}${select('goalUnit','Weight unit',[['kg','kg'],['lb','lb']],goal.unit)}${input('startWeight','Starting weight',goal.startWeight)}${input('goalWeight','Goal weight',goal.goalWeight)}${input('weeklyChange','Weekly change',goal.weeklyChange,{min:'-1000000'})}</div>`+
   `<div data-expenditure>${check('includeAboveBaseline','Add expenditure above baseline',target.includeAboveBaseline)}${select('display','Energy display',[['remaining','Remaining'],['balance','Balance']],p?.display??'remaining')}</div>`,form=>{
    const mode=form.elements.restingMode.value;if(mode==='none')return {type:'targetPolicy.energy',payload:{policy:null,kcal:numeric(form,'kcal')}};
    const resting=mode==='custom'?{mode,kcal:numeric(form,'restingKcal')}:{mode,adultScope:form.elements.adultScope.checked,sex:form.elements.sex.value,...(mode==='mifflin-st-jeor'?{age:numeric(form,'age')}:{birthDate:form.elements.birthDate.value}),heightCm:numeric(form,'heightCm'),weightKg:numeric(form,'weightKg')};
    const baseline=form.elements.baselineMode.value==='custom'?{mode:'custom',kcal:numeric(form,'baselineKcal')}:{mode:'multiplier',factor:Number(form.elements.baselineFactor.value)};
    const activity=form.elements.activityMode.value==='manual'?{mode:'manual'}:{mode:'health-connect',zone:form.elements.zone.value.trim()};
    const target={mode:form.elements.targetMode.value,includeAboveBaseline:form.elements.includeAboveBaseline.checked};
    if(target.mode==='calculated')target.adjustmentKcal=numeric(form,'adjustment');
    if(target.mode==='weight-goal')target.goal={startDate:form.elements.startDate.value,startWeight:numeric(form,'startWeight'),goalWeight:numeric(form,'goalWeight'),unit:form.elements.goalUnit.value,weeklyChange:numeric(form,'weeklyChange')};
    return {type:'targetPolicy.energy',payload:{policy:{version:1,resting,baseline,activity,thermicEffect:form.elements.thermicEffect.checked,target,display:form.elements.display.value},...(target.mode==='fixed'?{kcal:numeric(form,'kcal')}:{})}};
   });
  const toggle=()=>{const mode=form.elements.restingMode.value,configured=mode!=='none';if(!configured)form.elements.targetMode.value='fixed';form.elements.targetMode.disabled=!configured;form.querySelector('[data-resting=custom]').hidden=mode!=='custom';form.querySelector('[data-resting=equation]').hidden=!mode.startsWith('mifflin');form.querySelector('[data-age]').hidden=mode!=='mifflin-st-jeor';form.querySelector('[data-birth]').hidden=mode!=='mifflin-st-jeor-birthday';form.querySelectorAll('[data-expenditure]').forEach(row=>row.hidden=!configured);form.querySelector('[data-baseline-factor]').hidden=form.elements.baselineMode.value!=='multiplier';form.querySelector('[data-baseline-kcal]').hidden=form.elements.baselineMode.value!=='custom';form.querySelector('[data-device-zone]').hidden=form.elements.activityMode.value!=='health-connect';form.querySelectorAll('[data-target]').forEach(row=>row.hidden=row.dataset.target!==form.elements.targetMode.value);};
  form.querySelectorAll('select').forEach(select=>select.addEventListener('change',toggle));toggle();
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
