import {CaptureValidationError} from './capture-errors.js';
import {formatMessage} from './message-format.js';
import {isCompletenessGuidance} from './../server/completeness-guidance.mjs';
import {completenessNoteText,completenessDefinitionDescription} from './completeness-guidance.js';
import {scoreDisplayName} from './score-language.js';
import {nutrientDisplayName} from './nutrient-language.js';
import {completenessDefinitionFields} from './../server/completeness-metric.mjs';
import {createDataCompletenessDayReader} from './../server/data-completeness-report.mjs';
import {validateDataCompleteness,renderDataCompleteness,formatCompleteness} from './data-completeness.js';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,names)=>object(value)&&Object.keys(value).length===names.length&&names.every(name=>Object.hasOwn(value,name));
const count=value=>Number.isSafeInteger(value)&&value>=0;
const percent=value=>value===null||typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const invalid=()=>{throw new CaptureValidationError('completenessReport');};
const counts=['eligibleDays','definedDays','unknownDays','fullDays','incompleteDays'];
const fields=['meanPercent',...counts];
function period(row,extra,eligibleDays,membership=false){if(!keys(row,[...extra,...fields,...(membership?['membershipVaries']:[])])||!percent(row.meanPercent)||counts.some(key=>!count(row[key]))||row.eligibleDays!==eligibleDays||row.definedDays+row.unknownDays!==row.eligibleDays||row.fullDays+row.incompleteDays!==row.definedDays||(row.meanPercent===null)!==(row.definedDays===0)||membership&&typeof row.membershipVaries!=='boolean')invalid();}
export function validateDataCompletenessReport(value,{days,dates,eligibleDays}={}){
 if(!keys(value,['version','dailyLimitations','method','dailyMethod','denominator','overall','nutrients','groups','limitations'])||value.version!==4||value.method!=='mean-defined-daily-food-completeness-v1'||value.dailyMethod!=='local-food-leaf-completeness-v1'||value.denominator!=='food-leaf-occurrences'||!Array.isArray(value.nutrients)||!Array.isArray(value.groups)||!Array.isArray(value.limitations)||!value.limitations.every(isCompletenessGuidance))invalid();
 const total=eligibleDays??value.overall?.eligibleDays;if(!count(total))invalid();period(value.overall,[],total,true);const nutrients=new Map(),groups=new Map();
 for(const [rows,map,extra,membership]of [[value.nutrients,nutrients,['id','name','nutrientUnit'],false],[value.groups,groups,['id','name'],true]])for(const row of rows){period(row,[...extra,...(membership?[]:completenessDefinitionFields(row))],total,membership);if(typeof row.id!=='string'||!row.id||map.has(row.id)||typeof row.name!=='string'||!row.name||extra.includes('nutrientUnit')&&typeof row.nutrientUnit!=='string')invalid();map.set(row.id,row);}
 if(!nutrients.has('carbs')||!nutrients.has('netCarbohydrate')||!groups.size||!groups.has('overall'))invalid();for(const key of [...fields,'membershipVaries'])if(value.overall[key]!==groups.get('overall')[key])invalid();
 const readDay=createDataCompletenessDayReader(value);
 if(days!==undefined){if(!Array.isArray(days)||days.length!==total||dates!==undefined&&(!Array.isArray(dates)||dates.length!==days.length))invalid();let previous='';for(const [index,day]of days.entries()){if(!object(day)||typeof day.date!=='string'||day.date<=previous||dates!==undefined&&day.date!==dates[index])invalid();previous=day.date;const capture=validateDataCompleteness(readDay(day),{date:day.date});if(capture.nutrients.length!==nutrients.size||capture.groups.length!==groups.size)invalid();for(const row of capture.nutrients){const captured=nutrients.get(row.id);if(!captured||row.name!==captured.name||row.unit!==captured.nutrientUnit)invalid();}for(const row of capture.groups)if(!groups.has(row.id)||row.name!==groups.get(row.id).name)invalid();}}
 return value;
}
const message=(language,key,values)=>formatMessage(language,'completenessReport.'+key,values);
function periodRow(row,kind,id,label,language){
 const number=n=>n.toLocaleString(language);
 return `<tr data-completeness-period="${kind}" data-id="${esc(id)}"><th scope="row">${esc(label)}${kind==='nutrient'&&Object.hasOwn(row,'definition')?`<p class="mini-note">${esc(completenessDefinitionDescription(row,language))}</p>`:''}</th><td data-completeness-mean data-value="${row.meanPercent??''}">${esc(formatCompleteness(row.meanPercent,language))}</td><td>${number(row.definedDays)} / ${number(row.eligibleDays)}</td><td>${esc(message(language,'dayCounts',{full:number(row.fullDays),incomplete:number(row.incompleteDays),unknown:number(row.unknownDays)}))}</td>${kind==='nutrient'?'':`<td data-membership-varies="${row.membershipVaries}">${esc(message(language,row.membershipVaries?'varies':'same'))}</td>`}</tr>`;
}
function table(rows,{nutrients=false,language='en'}={}){
 const t=key=>esc(message(language,key));
 return `<div class="nutrition-report-table-region" role="region" tabindex="0" aria-label="${t(nutrients?'nutrientRegion':'groupRegion')}"><table class="nutrition-report-table"><thead><tr><th>${t(nutrients?'nutrient':'group')}</th><th>${t('mean')}</th><th>${t('defined')}</th><th>${t('counts')}</th>${nutrients?'':`<th>${t('membership')}</th>`}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
export function renderDataCompletenessReport(capture,{days,presentation='screen',language='en'}={}){
 validateDataCompletenessReport(capture,{days:presentation==='print'?undefined:days});const t=(key,values)=>esc(message(language,key,values));
 const daily=presentation==='print'||days===undefined?'':`<details data-completeness-days><summary>${t('daily',{count:days.length})}</summary><p>${t('dailyHelp')}</p>${days.map(day=>`<details data-completeness-day="${esc(day.date)}"><summary>${esc(day.date)} · ${esc(formatCompleteness(day.dataCompleteness.overall.percent,language))}</summary><div data-completeness-day-content></div></details>`).join('')}</details>`;
 const nutrientTable=table(capture.nutrients.map(row=>periodRow(row,'nutrient',row.id,nutrientDisplayName(row,language),language)).join(''),{nutrients:true,language});
 return `<section data-completeness-report><h2>${t('title')}</h2><p class="method">${t('method')}</p>${table(periodRow(capture.overall,'overall','overall',message(language,'overall'),language)+capture.groups.map(row=>periodRow(row,'group',row.id,scoreDisplayName(row,language),language)).join(''),{language})}${presentation==='print'?'<h3>'+t('byNutrient')+'</h3>'+nutrientTable:'<details data-completeness-nutrients><summary>'+t('byNutrient')+' ('+capture.nutrients.length.toLocaleString(language)+')</summary>'+nutrientTable+'</details>'}<ul class="method" data-completeness-limitations>${capture.limitations.map(note=>`<li>${esc(completenessNoteText(note,language))}</li>`).join('')}</ul>${daily}</section>`;
}
export function renderDataCompletenessDay(day,capture,{language='en'}={}){return renderDataCompleteness(createDataCompletenessDayReader(capture)(day),{language});}
