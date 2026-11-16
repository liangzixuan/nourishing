import {escape as esc} from './html.js';
import {projectDiaryTarget} from './report-source/server/diary-display.mjs';
import {isExerciseEntry,exerciseEntryFacts} from './report-source/server/nutrition.mjs';
import {displayValue,displayUnit} from './dashboard-source/energy-display.js';
import {parseEnergyUnit} from './dashboard-source/energy-units.mjs';
import {formatMessage} from './report-source/public/message-format.js';
import {nutrientDisplayName} from './report-source/public/nutrient-language.js';
const message=(language,key,values)=>formatMessage(language,'diaryDisplay.'+key,values);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const number=value=>typeof value==='number'&&Number.isFinite(value);
const nullable=value=>value===null||number(value);
const amount=(value,language='en')=>new Intl.NumberFormat(language,Math.abs(value)>0&&Math.abs(value)<0.005?{notation:'scientific',maximumSignificantDigits:3}:{maximumFractionDigits:2}).format(value);
export function diaryRecordedAmount(row){return row.active&&row.value===null&&row.coverage.total===0&&row.coverage.complete?0:row.value;}
function diaryAmountName(row,energyUnit,language,name){return row.id==='calories'&&energyUnit==='kcal'?'Calories':name;}

function validateRow(row,language='en'){
  const c=row?.coverage;
  if(!object(row)||['id','name','unit'].some(key=>typeof row[key]!=='string'||!row[key])||!['value','target','remaining'].every(key=>nullable(row[key]))||!object(c)||!Number.isInteger(c.known)||!Number.isInteger(c.total)||c.known<0||c.total<c.known||typeof c.complete!=='boolean'||typeof row.active!=='boolean'||!['complete','partial','unknown'].includes(row.status)||!['exact','upper-bound','unknown'].includes(row.remainingStatus))throw Error(message(language,'invalidRow'));
  if((row.value===null)!==(row.status==='unknown')||(row.remaining===null)!==(row.remainingStatus==='unknown')||row.status==='complete'&&!c.complete||row.status==='partial'&&c.complete||row.remainingStatus==='exact'&&row.status!=='complete'||row.remainingStatus==='upper-bound'&&row.status!=='partial'||row.remaining!==null&&(row.value===null||row.target===null)||!row.active&&(row.value!==null||row.target!==null||row.remaining!==null))throw Error(message(language,'invalidStatus'));
  return row;
}
export function renderDiaryTableAmount(row,{label=false,energyUnit='kcal',language='en'}={}){
  validateRow(row,language);parseEnergyUnit(energyUnit);
  const recorded=diaryRecordedAmount(row);
  const value=row.active?recorded===null?'—':`${amount(displayValue(recorded,row.unit,energyUnit),language)} ${displayUnit(row.unit,energyUnit)}`:message(language,'inactive');
  const detail=row.status==='partial'?message(language,'partial',row.coverage):!row.active?message(language,'enableNet'):'';
  return `<span class="diary-table-amount" data-diary-column="${esc(row.id)}" data-value="${recorded??''}" data-status="${row.status}" data-unit="${esc(row.unit)}">${label?`<span>${esc(diaryAmountName(row,energyUnit,language,nutrientDisplayName(row,language)))}: </span>`:''}<span>${esc(value)}</span>${detail?`<small>${esc(detail)}</small>`:''}</span>`;
}
/** Table cells consume canonical facts. The table policy never changes recorded intake. */
export function diaryEntryAmount(entry,table,{energyUnit='kcal',language='en'}={}){
 const id=table?.policy.summaryNutrient??'calories';
 if(isExerciseEntry(entry)){
  if(id!=='calories')return '<span class="diary-table-na">N/A</span>';
  const {calories}=exerciseEntryFacts(entry),value=calories===null?'—':amount(displayValue(-calories,'kcal',energyUnit),language)+' '+energyUnit;
  return `<span data-diary-column="calories">${esc(value)}<small class="diary-exercise-summary">Burned</small></span>`;
 }
 const facts=entry.facts;
 return renderDiaryTableAmount(projectDiaryTarget({id,totals:facts.nutrients,targets:{},coverage:facts.coverage,complete:false,carbohydrate:facts.carbohydrate,carbohydrates:facts.carbohydrates}),{energyUnit,language});
}
export function diaryGroupSubtotal(table,group,options){const rows=table?.groups.find(row=>row.name===group)?.rows??[];return rows.length?`<span class="md-group-subtotal" data-diary-group-subtotal="${esc(group)}">${rows.map(row=>renderDiaryTableAmount(row,{...options,label:true})).join('')}</span>`:'';}
