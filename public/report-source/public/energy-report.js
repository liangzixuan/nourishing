import {validateExpenditureBreakdown} from './../server/expenditure-breakdown.mjs';
import {validateConsumedBreakdown} from './../server/consumed-energy.mjs';
import {CaptureValidationError} from './capture-errors.js';
import {isEnergyReason,isEnergyLimitation} from './../server/energy-guidance.mjs';
import {formatEnergyReason,formatEnergyLimitation} from './energy-guidance-language.js';
import {formatMessage} from './message-format.js';
import {convertEnergy,parseEnergyUnit} from './../server/energy-units.mjs';
import {reportDayPagesMarkup} from './report-day-pages.js';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const known=value=>value===null||typeof value==='number'&&Number.isFinite(value);
const count=value=>Number.isSafeInteger(value)&&value>=0;
const numeric=['consumed','expenditure','target','remaining','balance','exercise','configuredTarget','targetBaseline','aboveBaseline'];
const components=['resting','baseline','adjustedBaseline','activity','thermicEffect'];
const columns=['consumed','expenditure','target','remaining','balance','exercise'];
const invalid=()=>{throw new CaptureValidationError('energyCapture');};
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const messages=language=>(key,values)=>formatMessage(language,'energyReport.'+key,values);
const displayEnergy=(language,energyUnit)=>value=>value===null?messages(language)('unknown'):convertEnergy(value,'kcal',energyUnit).toLocaleString(language,{maximumFractionDigits:4});

export function validateEnergyCapture(capture){
  if(!object(capture)||capture.version!==3||capture.unit!=='kcal'||!Array.isArray(capture.days)||!Array.isArray(capture.summary)||capture.summary.length!==columns.length||!Array.isArray(capture.limitations)||capture.limitations.some(value=>!isEnergyLimitation(value)))invalid();
  for(const [index,id]of columns.entries()){
    const row=capture.summary[index];
    if(!object(row)||row.id!==id||typeof row.name!=='string'||row.unit!=='kcal'||!known(row.mean)||['eligibleDays','knownDays','unknownDays','partialDays'].some(key=>!count(row[key]))||row.eligibleDays!==capture.days.length||row.knownDays+row.unknownDays!==row.eligibleDays||row.partialDays>row.knownDays)invalid();
  }
  const dates=new Set();
  for(const row of capture.days){
    const energy=row?.energy;
    if(!object(row)||typeof row.date!=='string'||dates.has(row.date)||typeof row.logged!=='boolean'||typeof row.complete!=='boolean'||!object(row.coverage)||!count(row.coverage.known)||!count(row.coverage.total)||typeof row.coverage.complete!=='boolean'||!object(energy)||energy.version!==1||numeric.some(key=>!known(energy[key]))||!object(energy.components)||components.some(key=>!known(energy.components[key]))||typeof energy.configured!=='boolean'||!['remaining','balance'].includes(energy.display)||!['manual','health-connect','unconfigured'].includes(energy.activityMode)||!Array.isArray(energy.reasons)||energy.reasons.some(value=>!isEnergyReason(value)))invalid();
    if(energy.device!==null&&(!object(energy.device)||typeof energy.device.zone!=='string'||typeof energy.device.end!=='string'||typeof energy.device.value!=='number'||!Number.isFinite(energy.device.value)))invalid();
    dates.add(row.date);
  }
  validateExpenditureBreakdown(capture.breakdown,capture.summary.find(row=>row.id==='expenditure'));
  validateConsumedBreakdown(capture.consumedBreakdown,capture.summary.find(row=>row.id==='consumed'));
  return capture;
}

/** Yield bounded rows so the standalone print writer can enforce its byte cap
 * before accumulating the whole escaped document. All arithmetic is captured. */
export function* energyReportFragments(capture,{daily=true,collapsibleDaily=false,presentation='screen',pagedDaily=false,energyUnit='kcal',language='en'}={}){
  validateEnergyCapture(capture);parseEnergyUnit(energyUnit);
  const message=messages(language),text=(key,values)=>escape(message(key,values)),display=displayEnergy(language,energyUnit);
  yield `<section class="energy-report" data-energy-report><h2>${text('title')}</h2><p>${text('explanation',{unit:energyUnit})}${presentation==='print'?'':' '+text('scroll')}</p><div class="nutrition-report-table-region" role="region" tabindex="0" aria-label="${text('summaryRegion')}"><table class="energy-report-summary nutrition-report-table"><thead><tr><th>${text('fact')}</th><th>${text('mean',{unit:energyUnit})}</th><th>${text('knownDays')}</th><th>${text('unknownDays')}</th><th>${text('partialDays')}</th></tr></thead><tbody>`;
  for(const row of capture.summary)yield `<tr data-energy-summary="${escape(row.id)}"><th>${language==='en'?escape(row.name):text(['target','remaining','balance'].includes(row.id)?'summary.'+row.id:row.id)}</th><td data-energy-mean>${display(row.mean)}</td><td>${row.knownDays} / ${row.eligibleDays}</td><td>${row.unknownDays}</td><td>${row.partialDays}</td></tr>`;
  yield '</tbody></table></div>';
  if(daily&&pagedDaily&&presentation!=='print')yield reportDayPagesMarkup('energy',capture.days.length,'data-energy-report-days',{language});
  else if(daily){
    if(collapsibleDaily)yield `<details class="dashboard-daily"><summary>${text('dailyCount',{count:capture.days.length})}</summary>`;
    yield* energyDailyFragments(capture.days,{energyUnit,language});
    if(collapsibleDaily)yield '</details>';
  }
  yield '<ul class="energy-limitations">'+capture.limitations.map(value=>`<li>${escape(formatEnergyLimitation(value,language))}</li>`).join('')+'</ul></section>';
}
export const renderEnergyCapture=(capture,options)=>Array.from(energyReportFragments(capture,options)).join('');

export function* energyDailyFragments(days,{energyUnit='kcal',language='en'}={}){
    parseEnergyUnit(energyUnit);const message=messages(language),text=(key,values)=>escape(message(key,values)),display=displayEnergy(language,energyUnit);
    yield `<h3>${text('daily')}</h3><div class="nutrition-report-table-region" role="region" tabindex="0" aria-label="${text('dailyRegion')}"><table class="energy-daily nutrition-report-table"><thead><tr><th>${text('date')}</th>${columns.map(key=>`<th>${text(key)}<br>${energyUnit}</th>`).join('')}</tr></thead>`;
    for(const row of days){
      const energy=row.energy,basis=energy.components;
      yield `<tbody class="energy-day"><tr data-energy-date="${escape(row.date)}"><th>${escape(row.date)}</th>${columns.map(key=>`<td data-energy-value="${key}">${display(energy[key])}</td>`).join('')}</tr>`;
      const activity=message('activity.'+energy.activityMode),diary=message(row.complete&&row.coverage.total===0?'completionZero':row.complete?'complete':'incomplete');
      yield `<tr class="energy-basis" data-energy-coverage-date="${escape(row.date)}"><td colspan="7"><p>${text('basis',{activity,resting:display(basis.resting),baseline:display(basis.baseline),adjusted:display(basis.adjustedBaseline),active:display(basis.activity),thermic:display(basis.thermicEffect),unit:energyUnit})}</p><p>${text('coverage',{known:row.coverage.known,total:row.coverage.total,coverage:message(row.coverage.complete?'complete':'partial'),diary,target:display(energy.targetBaseline),above:display(energy.aboveBaseline),unit:energyUnit})}</p>${energy.device?`<p>${text('device',{end:energy.device.end,zone:energy.device.zone,value:display(energy.device.value),unit:energyUnit})}</p>`:''}${energy.reasons.length?`<p>${text('reasons',{reasons:energy.reasons.map(code=>formatEnergyReason(code,language)).join(' · ')})}</p>`:''}</td></tr></tbody>`;
    }
    yield '</table></div>';
}
export const renderEnergyDays=(days,options)=>Array.from(energyDailyFragments(days,options)).join('');
