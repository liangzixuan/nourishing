import {CaptureValidationError} from './capture-errors.js';
import {isCompletenessGuidance} from './../server/completeness-guidance.mjs';
import {completenessNoteText,completenessDefinitionDescription} from './completeness-guidance.js';
import {formatMessage} from './message-format.js';
import {scoreDisplayName} from './score-language.js';
import {nutrientDisplayName} from './nutrient-language.js';
import {completenessDefinitionFields} from './../server/completeness-metric.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,names)=>object(value)&&Object.keys(value).length===names.length&&names.every(name=>Object.hasOwn(value,name));
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const percent=value=>value===null||typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
const strings=value=>Array.isArray(value)&&value.every(item=>typeof item==='string');
const unique=value=>strings(value)&&value.every(Boolean)&&new Set(value).size===value.length;
const fail=()=>{throw new CaptureValidationError('completenessDay');};
function header(value,date,version=2){if(value.version!==version||value.method!=='local-food-leaf-completeness-v1'||value.denominator!=='food-leaf-occurrences'||typeof value.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.date)||new Date(value.date+'T00:00:00Z').toISOString().slice(0,10)!==value.date||date!==undefined&&value.date!==date||(!Array.isArray(value.limitations)||!value.limitations.every(isCompletenessGuidance)))fail();}
export function validateFoodData(value){if(!keys(value,['known','total','percent'])||!integer(value.known)||!integer(value.total)||value.known>value.total||!percent(value.percent)||(value.total===0)!==(value.percent===null))fail();return value;}
function memberIds(ids,known){if(!unique(ids)||ids.some(id=>!known.has(id)))fail();}
export function validateScoreDataCompleteness(value,components,date){if(!keys(value,['version','date','method','denominator','componentIds','percent','limitations'])||!percent(value.percent))fail();header(value,date);memberIds(value.componentIds,new Set(components.map(row=>row.id)));if(value.componentIds.length===0&&value.percent!==null)fail();return value;}
export function validateDataCompleteness(value,{date}={}){
 if(!keys(value,['version','date','method','denominator','nutrients','groups','overall','limitations'])||!Array.isArray(value.nutrients)||!Array.isArray(value.groups))fail();header(value,date,3);const ids=new Set(),groups=new Set();
 for(const row of value.nutrients){if(!keys(row,['id','name','unit','known','total','percent',...completenessDefinitionFields(row)])||typeof row.id!=='string'||!row.id||ids.has(row.id)||typeof row.name!=='string'||typeof row.unit!=='string')fail();validateFoodData({known:row.known,total:row.total,percent:row.percent});ids.add(row.id);}
 for(const row of value.groups){if(!keys(row,['id','name','componentIds','percent'])||typeof row.id!=='string'||!row.id||groups.has(row.id)||typeof row.name!=='string'||!percent(row.percent))fail();memberIds(row.componentIds,ids);if(row.componentIds.length===0&&row.percent!==null)fail();groups.add(row.id);}
 if(!ids.has('carbs')||!ids.has('netCarbohydrate'))fail();
 if(!keys(value.overall,['componentIds','percent'])||!percent(value.overall.percent))fail();memberIds(value.overall.componentIds,ids);const overall=value.groups.find(row=>row.id==='overall');if(!overall||overall.percent!==value.overall.percent||JSON.stringify(overall.componentIds)!==JSON.stringify(value.overall.componentIds))fail();return value;
}
export function formatCompleteness(value,language='en'){if(value===null)return formatMessage(language,'completeness.unknown');return value.toLocaleString(language,value!==0&&Math.abs(value)<0.01?{maximumSignificantDigits:4}:{maximumFractionDigits:2})+'%';}
const amount=(value,language)=>`<span data-dc-percent data-value="${value===null?'':esc(value)}" title="${value===null?esc(formatMessage(language,'completeness.unknown')):esc(value)}">${esc(formatCompleteness(value,language))}</span>`;
export function renderDataCompleteness(capture,{language='en'}={}){
 const view=validateDataCompleteness(capture),names=new Map(view.nutrients.map(row=>[row.id,nutrientDisplayName(row,language)])),message=(key,values)=>esc(formatMessage(language,'completeness.'+key,values));
 return `<section data-data-completeness data-dc-date="${esc(view.date)}"><p>${message('day',{date:view.date})}</p><h3>${message('title')}: ${amount(view.overall.percent,language)}</h3><p>${message('description')}</p><p>${message('counting')}</p><h4>${message('groups')}</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>${message('group')}</th><th>${message('availability')}</th></tr></thead><tbody>${view.groups.map(row=>`<tr data-dc-group="${esc(row.id)}"><td>${esc(scoreDisplayName(row,language))}<details><summary>${message('components',{count:row.componentIds.length})}</summary><ul>${row.componentIds.map(id=>`<li>${esc(names.get(id))}</li>`).join('')}</ul></details></td><td>${amount(row.percent,language)}</td></tr>`).join('')}</tbody></table></div><h4>${message('nutrients')}</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>${message('nutrient')}</th><th>${message('known')}</th><th>${message('availability')}</th></tr></thead><tbody>${view.nutrients.map(row=>`<tr data-dc-nutrient="${esc(row.id)}"><td>${esc(nutrientDisplayName(row,language))}${Object.hasOwn(row,'definition')?`<p class="mini-note">${esc(completenessDefinitionDescription(row,language))}</p>`:''}</td><td data-dc-count>${row.known} / ${row.total}</td><td>${amount(row.percent,language)}</td></tr>`).join('')}</tbody></table></div><h4>${message('limits')}</h4><ul data-dc-limitations>${view.limitations.map(item=>`<li>${esc(completenessNoteText(item,language))}</li>`).join('')}</ul></section>`;
}
