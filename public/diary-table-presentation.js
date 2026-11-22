import {escape as esc} from './html.js';
import {projectDiaryTarget} from './report-source/server/diary-display.mjs';
import {isExerciseEntry,exerciseEntryFacts} from './report-source/server/nutrition.mjs';
import {displayValue,displayUnit} from './dashboard-source/energy-display.js';
import {parseEnergyUnit} from './dashboard-source/energy-units.mjs';
import {formatMessage} from './report-source/public/message-format.js';
import {mobileNutrientName} from './mobile-nutrient-groups.js';
import {coreText} from './core-cloud-messages.js';
const message=(language,key,values)=>formatMessage(language,'diaryDisplay.'+key,values);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const number=value=>typeof value==='number'&&Number.isFinite(value);
const nullable=value=>value===null||number(value);
const amount=(value,language='en',maximumFractionDigits=2)=>new Intl.NumberFormat(language,Math.abs(value)>0&&Math.abs(value)<0.5*10**-maximumFractionDigits?{notation:'scientific',maximumSignificantDigits:3}:{maximumFractionDigits}).format(value);
export function diaryRecordedAmount(row){return row.active&&row.value===null&&row.coverage.total===0&&row.coverage.complete?0:row.value;}
function diaryAmountName(row,energyUnit,language,name){return row.id==='calories'&&energyUnit==='kcal'?coreText('calories',{},language):name;}

function validateRow(row,language='en'){
  const c=row?.coverage;
  if(!object(row)||['id','name','unit'].some(key=>typeof row[key]!=='string'||!row[key])||!['value','target','remaining'].every(key=>nullable(row[key]))||!object(c)||!Number.isInteger(c.known)||!Number.isInteger(c.total)||c.known<0||c.total<c.known||typeof c.complete!=='boolean'||typeof row.active!=='boolean'||!['complete','partial','unknown'].includes(row.status)||!['exact','upper-bound','unknown'].includes(row.remainingStatus))throw Error(message(language,'invalidRow'));
  if((row.value===null)!==(row.status==='unknown')||(row.remaining===null)!==(row.remainingStatus==='unknown')||row.status==='complete'&&!c.complete||row.status==='partial'&&c.complete||row.remainingStatus==='exact'&&row.status!=='complete'||row.remainingStatus==='upper-bound'&&row.status!=='partial'||row.remaining!==null&&(row.value===null||row.target===null)||!row.active&&(row.value!==null||row.target!==null||row.remaining!==null))throw Error(message(language,'invalidStatus'));
  return row;
}
export function renderDiaryTableAmount(row,{label=false,stackEnergy=false,energyUnit='kcal',language='en'}={}){
  validateRow(row,language);parseEnergyUnit(energyUnit);
  const recorded=diaryRecordedAmount(row);
  const value=row.active?recorded===null?'—':`${amount(displayValue(recorded,row.unit,energyUnit),language)} ${displayUnit(row.unit,energyUnit)}`:message(language,'inactive');
  let reading=esc(value);
  if(stackEnergy && row.id==='calories' && row.active && recorded!==null){
    const energy=displayValue(recorded,row.unit,energyUnit).toLocaleString(language,{minimumFractionDigits:1,maximumFractionDigits:1});
    reading=`${esc(energy)} <small class="md-food-energy-unit">${esc(displayUnit(row.unit,energyUnit))}</small>`;
  }
  const detail=row.status==='partial'?message(language,'partial',row.coverage):!row.active?message(language,'enableNet'):'';
  return `<span class="diary-table-amount" data-diary-column="${esc(row.id)}" data-value="${recorded??''}" data-status="${row.status}" data-unit="${esc(row.unit)}">${label?`<span>${esc(diaryAmountName(row,energyUnit,language,mobileNutrientName(row,language)))}: </span>`:''}<span>${reading}</span>${detail?`<small>${esc(detail)}</small>`:''}</span>`;
}
/** Table cells consume canonical facts. The table policy never changes recorded intake. */
export function diaryEntryAmount(entry,table,{energyUnit='kcal',language='en',exerciseFractionDigits=2}={}){
 const id=table?.policy.summaryNutrient??'calories';
 if(id==='none')return '';
 if(isExerciseEntry(entry)){
  if(id!=='calories')return `<span class="diary-table-na">${esc(coreText('notApplicable',{},language))}</span>`;
  const {calories}=exerciseEntryFacts(entry),value=calories===null?'—':amount(displayValue(-calories,'kcal',energyUnit),language,exerciseFractionDigits)+' '+energyUnit;
  return `<span data-diary-column="calories">${esc(value)}<small class="diary-exercise-summary">${esc(coreText('burned',{},language))}</small></span>`;
 }
 const facts=entry.facts;
 return renderDiaryTableAmount(projectDiaryTarget({id,totals:facts.nutrients,targets:{},coverage:facts.coverage,complete:false,carbohydrate:facts.carbohydrate,carbohydrates:facts.carbohydrates}),{energyUnit,language,stackEnergy:true});
}
export function diaryGroupSubtotal(table,group,options){const rows=table?.groups.find(row=>row.name===group)?.rows??[];return rows.length?`<span class="md-group-subtotal" data-diary-group-subtotal="${esc(group)}">${rows.map(row=>renderDiaryTableAmount(row,{...options,label:true})).join('')}</span>`:'';}
