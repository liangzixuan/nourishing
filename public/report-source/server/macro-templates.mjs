import {date as calendarDate} from './calendar.mjs';
import {parseMacroPolicy} from './macro-policy.mjs';

const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const own=(value,key)=>Object.hasOwn(value??{},key);
function fields(value,keys,label){if(!object(value)||Object.keys(value).length!==keys.length||keys.some(key=>!own(value,key)))fail(`Choose the required ${label} fields only.`);}
function text(value,label){if(typeof value!=='string'||!value||value!==value.trim()||value.length>120)fail(`${label} must be a nonempty trimmed string of at most 120 characters.`);return value;}
function number(value,label,{nullable=false}={}){if(nullable&&value===null)return null;if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1000000)fail(`${label} must be a finite number from 0 to 1,000,000${nullable?', or null':''}.`);return value;}
const ordered=(a,b)=>a<b?-1:a>b?1:0;
function list(value,label){if(!Array.isArray(value))fail(`${label} must be an array.`);return value;}

/** A template owns explicit macro settings and a separate energy choice. */
export function parseTemplateSettings(value){
  fields(value,['macro','energy'],'template settings');let macro,energy;
  if(value.macro?.mode==='fixed'){
    fields(value.macro,['mode','targets'],'fixed template macros');fields(value.macro.targets,['protein','carbohydrate','fat'],'fixed template targets');
    macro={mode:'fixed',targets:Object.fromEntries(['protein','carbohydrate','fat'].map(key=>[key,number(value.macro.targets[key],`Template ${key}`,{nullable:true})]))};
  }else{macro=parseMacroPolicy(value.macro);if(macro===null)fail('Choose explicit fixed, ratio or keto template macros.');}
  if(value.energy?.mode==='inherit'){fields(value.energy,['mode'],'inherited template energy');energy={mode:'inherit'};}
  else if(value.energy?.mode==='fixed'){fields(value.energy,['mode','kcal'],'fixed template energy');energy={mode:'fixed',kcal:number(value.energy.kcal,'Template energy')};}
  else fail('Choose inherited or fixed template energy.');
  return {macro,energy};
}
function parseTemplate(value){fields(value,['id','name','settings'],'template');return {id:text(value.id,'Template ID'),name:text(value.name,'Template name'),settings:parseTemplateSettings(value.settings)};}
function parseSelection(value){
  if(value?.kind==='default'){fields(value,['kind'],'default day selection');return {kind:'default'};}
  if(value?.kind==='template'){fields(value,['kind','id'],'template day selection');return {kind:'template',id:text(value.id,'Template ID')};}
  if(value?.kind==='custom'){fields(value,['kind','settings'],'custom day selection');return {kind:'custom',settings:parseTemplateSettings(value.settings)};}
  fail('Choose a default, template or custom day selection.');
}
function parseWeek(value){
  fields(value,['from','days'],'weekly assignment');const from=calendarDate(value.from),days=list(value.days,'Weekly assignments');
  if(days.length!==7)fail('Choose exactly seven Sunday-first weekly assignments.');
  return {from,days:Array.from(days,id=>id===null?null:text(id,'Weekly template ID'))};
}
function unique(values,label){if(new Set(values).size!==values.length)fail(`Duplicate ${label} are not allowed.`);}

/** Canonical validation is the only owner of template references and ordering. */
export function parseMacroPlan(value){
  if(value===undefined||value===null)return {version:1,templates:[],weeks:[],days:[]};
  fields(value,['version','templates','weeks','days',...(own(value,'enabled')?['enabled']:[])],'macro plan');if(value.version!==1)fail('Choose a version 1 macro plan.');
  if(own(value,'enabled')&&typeof value.enabled!=='boolean')fail('Choose a boolean scheduler state.');
  const templates=Array.from(list(value.templates,'Templates'),parseTemplate),weeks=Array.from(list(value.weeks,'Weekly history'),parseWeek),days=Array.from(list(value.days,'Day assignments'),row=>{fields(row,['date','selection'],'day assignment');return {date:calendarDate(row.date),selection:parseSelection(row.selection)};});
  unique(templates.map(row=>row.id),'template IDs');unique(weeks.map(row=>row.from),'weekly start dates');unique(days.map(row=>row.date),'day dates');
  const ids=new Set(templates.map(row=>row.id)),reference=id=>{if(id!==null&&!ids.has(id))fail('A macro assignment refers to an unknown template.');};
  for(const week of weeks)for(const id of week.days)reference(id);for(const row of days)if(row.selection.kind==='template')reference(row.selection.id);
  templates.sort((a,b)=>ordered(a.id,b.id));weeks.sort((a,b)=>ordered(a.from,b.from));days.sort((a,b)=>ordered(a.date,b.date));
  return {version:1,templates,weeks,days,...(value.enabled===false?{enabled:false}:{})};
}

/** Apply one explicit edit to a new plan. Weekly edits never rewrite history. */
export function changeMacroPlan(value,change,{today}={}){
  const plan=parseMacroPlan(value);calendarDate(today);if(!object(change))fail('Choose a macro plan change.');
  switch(change.kind){
    case 'enabled': {
      fields(change,['kind','enabled'],'scheduler state');if(typeof change.enabled!=='boolean')fail('Choose a boolean scheduler state.');
      if(change.enabled)delete plan.enabled;else plan.enabled=false;break;
    }
    case 'weekday': {
      fields(change,['kind','weekday','templateId'],'weekday assignment');const {weekday,templateId}=change;
      if(!Number.isInteger(weekday)||weekday<0||weekday>6)fail('Choose a Sunday-first weekday from 0 to 6.');
      if(templateId!==null&&!plan.templates.some(row=>row.id===templateId))fail('Choose an existing template or default targets.');
      const current=weekAt(plan,today),days=[...(current?.days??Array(7).fill(null))];days[weekday]=templateId;
      // A single weekday edit preserves the other six days, including future transitions.
      plan.weeks=plan.weeks.filter(row=>row.from!==today).map(row=>row.from>today?{...row,days:row.days.map((id,i)=>i===weekday?templateId:id)}:row);
      plan.weeks.push({from:today,days});break;
    }
    case 'template-create':
    case 'template-update': {
      fields(change,['kind','template'],'template change');const template=parseTemplate(change.template),index=plan.templates.findIndex(row=>row.id===template.id);
      if(change.kind==='template-create'){if(index!==-1)fail('This template ID already exists.');plan.templates.push(template);}
      else{if(index===-1)fail('The template to update does not exist.');plan.templates[index]=template;}break;
    }
    case 'template-delete': {
      fields(change,['kind','id'],'template deletion');const id=text(change.id,'Template ID');if(!plan.templates.some(row=>row.id===id))fail('The template to delete does not exist.');
      plan.templates=plan.templates.filter(row=>row.id!==id);for(const week of plan.weeks)week.days=week.days.map(reference=>reference===id?null:reference);
      for(const row of plan.days)if(row.selection.kind==='template'&&row.selection.id===id)row.selection={kind:'default'};break;
    }
    case 'weekly': {
      fields(change,['kind','from','days'],'weekly change');const week=parseWeek({from:change.from,days:change.days});if(week.from<today)fail('Weekly changes must start today or later.');
      plan.weeks=plan.weeks.filter(row=>row.from<week.from);plan.weeks.push(week);break;
    }
    case 'reset': {
      fields(change,['kind','from'],'schedule reset');const from=calendarDate(change.from);if(from<today)fail('Schedule resets must start today or later.');
      plan.weeks=plan.weeks.filter(row=>row.from<from);plan.weeks.push({from,days:Array(7).fill(null)});plan.days=plan.days.filter(row=>row.date<from);break;
    }
    case 'day': {
      fields(change,['kind','date','selection'],'day change');const date=calendarDate(change.date),selection=change.selection===null?null:parseSelection(change.selection);
      plan.days=plan.days.filter(row=>row.date!==date);if(selection!==null)plan.days.push({date,selection});break;
    }
    default:fail('Choose a supported macro plan change.');
  }
  return parseMacroPlan(plan);
}

const weekAt=(plan,date)=>plan.weeks.findLast(row=>row.from<=date);
/** Stored weekday choices remain visible while the scheduler is disabled. */
export function projectMacroWeek(value,date){
  const plan=parseMacroPlan(value);calendarDate(date);const week=weekAt(plan,date);
  return {enabled:plan.enabled!==false,from:week?.from??null,days:[...(week?.days??Array(7).fill(null))]};
}

/** One date lookup; never enumerate a requested calendar range. */
export function resolveMacroAssignment(value,date){
  const plan=parseMacroPlan(value);calendarDate(date);
  const assignment=(source,{templateId=null,name=null,effectiveFrom=null,settings=null}={})=>({source,templateId,name,effectiveFrom,settings});
  const template=(id,source,effectiveFrom)=>{const row=plan.templates.find(item=>item.id===id);return assignment(source,{templateId:id,name:row.name,effectiveFrom,settings:row.settings});};
  if(plan.enabled===false)return assignment('default');
  const daily=plan.days.find(row=>row.date===date);
  if(daily){
    if(daily.selection.kind==='default')return assignment('daily-default',{effectiveFrom:date});
    if(daily.selection.kind==='custom')return assignment('daily-custom',{effectiveFrom:date,settings:daily.selection.settings});
    return template(daily.selection.id,'daily-template',date);
  }
  const week=weekAt(plan,date);if(!week)return assignment('default');
  const id=week.days[new Date(`${date}T12:00:00Z`).getUTCDay()];return id===null?assignment('default',{effectiveFrom:week.from}):template(id,'weekly',week.from);
}
