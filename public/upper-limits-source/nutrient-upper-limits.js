import {isHttpsReferenceUrl} from '../report-source/public/reference-url.js';
import {formatMessage} from '../report-source/public/message-format.js';
const message=(language,key,values)=>formatMessage(language,'referencePanel.'+key,values);
import {upperLimitBasisLabel} from '../report-source/public/threshold-language.js';
import {nutrientDisplayName} from '../report-source/public/nutrient-language.js';
import {renderSourceAttributions} from './source-attribution.js';
import {NUTRIENT_UPPER_LIMIT_SET,parseNutrientUpperLimitPolicy} from '../report-source/server/nutrient-upper-limits.mjs';
import {thresholdMarkup,validateNutrientThreshold} from './nutrient-threshold.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const statuses=new Set(['profile-required','unsupported','not-determined','known']);
const same=(a,b)=>a.length===b.length&&a.every(id=>b.includes(id));
function source(value,language='en'){
  if(!object(value)||value.referenceSet!==NUTRIENT_UPPER_LIMIT_SET||['title','url','tableId','headerId','sourceId'].some(key=>typeof value[key]!=='string'||!value[key])||!isHttpsReferenceUrl(value.url))throw Error(message(language,'upperMissingSource'));
}
function validate(c,date,language='en'){
  if(!object(c)||c.date!==date||!Object.hasOwn(c,'policy')||!Array.isArray(c.options))throw Error(message(language,'upperMissingCapture'));
  const policy=parseNutrientUpperLimitPolicy(c.policy),options=new Map();
  for(const row of c.options){if(!object(row)||['id','name','unit','intakeBasis'].some(key=>typeof row[key]!=='string'||!row[key])||typeof row.comparisonSupported!=='boolean'||options.has(row.id))throw Error(message(language,'upperInvalidOption'));source(row.source,language);options.set(row.id,row);}
  const p=c.projection,display=c.summary?.nutrientDisplay;
  if(!object(p)||p.version!==1||p.date!==date||p.referenceSet!==NUTRIENT_UPPER_LIMIT_SET||!['disabled','profile-required','unsupported','known'].includes(p.status)||!Array.isArray(p.selected)||!same(p.selected,policy?.nutrients??[])||!Array.isArray(p.references)||!same(p.references.map(row=>row.id),p.selected)||!object(display?.thresholds)||!Array.isArray(display.referenceMaximums))throw Error(message(language,'upperInvalidProjection'));
  if((policy===null)!==(p.status==='disabled'))throw Error(message(language,'upperInvalidSelection'));
  for(const row of p.references){
    const option=options.get(row.id),captured=display.referenceMaximums.find(item=>item.id===row.id);
    if(!option||!statuses.has(row.status)||!(row.maximum===null||Number.isFinite(row.maximum)&&row.maximum>=0)||row.comparisonSupported!==option.comparisonSupported||row.intakeBasis!==option.intakeBasis||(row.status==='known')!==(row.maximum!==null)||!captured||typeof captured.overridden!=='boolean'||captured.maximum!==row.maximum||captured.status!==row.status)throw Error(message(language,'upperInvalidRow'));
    source(row.source,language);
    if(Object.keys(option.source).some(key=>row.source[key]!==option.source[key]))throw Error(message(language,'upperSourceMismatch'));
    const threshold=validateNutrientThreshold(display.thresholds[row.id]);
    if(!captured.overridden&&(row.maximum===null?threshold!==null:threshold===null||threshold.maximum!==row.maximum||threshold.comparisonSupported!==row.comparisonSupported||threshold.intakeBasis!==row.intakeBasis))throw Error(message(language,'upperComparisonMismatch'));
  }
  return c;
}
function markup(c,language){
 const m=(key,values)=>message(language,key,values),p=c.projection,options=new Map(c.options.map(row=>[row.id,row]));
 const status={disabled:'upperOff','profile-required':'profileRequired',unsupported:'upperUnsupported',known:'upperKnown'},rowStatus={'not-determined':'statusNotDetermined','profile-required':'statusProfileRequired',unsupported:'statusUnsupported'};
 return `<section class="reference-capture"><h3>${esc(m('upperDate',{date:p.date}))}</h3><p>${esc(m(status[p.status]))}</p><details class="reference-help"><summary>Details</summary><p class="mini-note">${esc(m('upperHelp'))}</p></details>${p.references.length?`<div class="reference-table-region upper-limit-table" role="region" tabindex="0" aria-label="${esc(m('upperRegion'))}"><table><thead><tr><th>${esc(formatMessage(language,'nutrientDisplay.nutrient'))}</th>${['populationUL','effectiveComparison','scopeSource'].map(key=>`<th>${esc(m(key))}</th>`).join('')}</tr></thead><tbody>${p.references.map(row=>{
 const option=options.get(row.id),captured=c.summary.nutrientDisplay.referenceMaximums.find(item=>item.id===row.id),threshold=c.summary.nutrientDisplay.thresholds[row.id];
 return `<tr data-upper-limit-row="${esc(row.id)}"><th>${esc(nutrientDisplayName(option,language))}</th><td data-upper-limit-value>${row.maximum===null?esc(m(rowStatus[row.status])):esc(row.maximum)+' '+esc(option.unit)}</td><td>${captured.overridden?`<p>${esc(m('override'))}</p>`:''}${threshold?thresholdMarkup(threshold,option.unit,{language}):`<p>${esc(m('noMaximum'))}</p>`}</td><td><p>${esc(upperLimitBasisLabel(row.intakeBasis,language))}</p>${!row.comparisonSupported?`<p>${esc(m('formUnknown'))}</p>`:''}${row.source.group?`<p>${esc(row.source.group)} · ${esc(row.source.ageLabel)}</p>`:''}<a href="${esc(row.source.url)}" target="_blank" rel="noopener noreferrer">${esc(row.source.title)}</a><small>${esc(row.source.tableId)} · ${esc(row.source.headerId)}</small></td></tr>`;
 }).join('')}</tbody></table></div>`:`<p>${esc(m('upperNone'))}</p>`}${renderSourceAttributions(c.summary.attributions)}</section>`;
}
export const upperLimitConfiguration={
 optionBasis:(row,language)=>upperLimitBasisLabel(row.intakeBasis,language),path:'/api/nutrient-upper-limits',
 messages:language=>Object.fromEntries(Object.entries({title:'upperTitle',description:'upperIntro',scope:'upperScope',selectionNote:'upperSelection',confirmation:'upperConfirm'}).map(([key,id])=>[key,message(language,id)])),
 inputs:nutrients=>({version:1,referenceSet:NUTRIENT_UPPER_LIMIT_SET,nutrients}),validate,markup,
};
