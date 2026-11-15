import {CaptureValidationError} from './capture-errors.js';
import {isScoreReportGuidance} from './../server/score-report-guidance.mjs';
import {scoreReportGuidanceText} from './score-guidance-language.js';
import {formatMessage} from './message-format.js';
import {scoreDisplayName} from './score-language.js';
import {validScoreGate,formatScoreGate,formatScoreDisplay,requiresScoreConfidence,formatScoreConfidence} from './score-gate.js';
import {reportDayPagesMarkup} from './report-day-pages.js';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const count=value=>Number.isSafeInteger(value)&&value>=0;
const number=value=>typeof value==='number'&&Number.isFinite(value);
const confidence=value=>number(value)&&value>=0&&value<=100;
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const message=(language,key,values)=>formatMessage(language,'scoreReport.'+key,values);
const display=(value,language)=>value===null?message(language,'unknown'):value.toLocaleString(language,{maximumFractionDigits:4})+'%';
const invalid=()=>{throw new CaptureValidationError('scoreReport');};

/** Validate capture structure and identity. Score arithmetic belongs to the server. */
export function validateScoreReport(capture,{dates,eligibleDays}={}){
  if(!object(capture)||capture.version!==6||capture.method!=='mean-known-daily-local-scores-v1'||!Array.isArray(capture.summary)||capture.summary.length===0||!Array.isArray(capture.days)||!Array.isArray(capture.limitations)||capture.limitations.some(value=>!isScoreReportGuidance(value)))invalid();
  const identities=new Map();
  for(const row of capture.summary){
    if(!object(row)||typeof row.id!=='string'||!row.id||identities.has(row.id)||typeof row.name!=='string'||!row.name||row.unit!=='%'||typeof row.description!=='string'||typeof row.method!=='string'||!row.method||row.mean!==null&&!(row.method==='public-web-food-data-quality-v1'?confidence(row.mean):number(row.mean))||['eligibleDays','knownDays','partialDays','unknownDays'].some(key=>!count(row[key]))||row.eligibleDays!==capture.days.length||row.knownDays+row.unknownDays!==row.eligibleDays||row.partialDays>row.knownDays||(row.mean===null)!==(row.knownDays===0))invalid();
    if(requiresScoreConfidence(row.method,row.id)){const c=row.confidence;if(!c||Object.keys(c).length!==3||c.method!=='mean-daily-source-data-confidence-v1'||c.days!==capture.days.length||!(c.value===null||confidence(c.value))||(c.value===null)!==(c.days===0))invalid();}else if(Object.hasOwn(row,'confidence'))invalid();
    identities.set(row.id,{name:row.name,method:row.method});
  }
  if(eligibleDays!==undefined&&capture.days.length!==eligibleDays||dates!==undefined&&(!Array.isArray(dates)||dates.length!==capture.days.length))invalid();
  let previous='';
  for(const [index,day]of capture.days.entries()){
    if(!object(day)||typeof day.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day.date)||day.date<=previous||dates!==undefined&&day.date!==dates[index]||!Array.isArray(day.scores)||day.scores.length!==identities.size)invalid();previous=day.date;
    const seen=new Set();
    for(const score of day.scores){
      if(!object(score)||!identities.has(score.id)||seen.has(score.id)||Object.keys(score).some(key=>!['id','value','coverage','gate','display','confidence'].includes(key))||score.value!==null&&!number(score.value)||!object(score.coverage)||!count(score.coverage.known)||!count(score.coverage.total)||score.coverage.known>score.coverage.total||typeof score.coverage.complete!=='boolean'||!validScoreGate({...score,method:identities.get(score.id).method}))invalid();seen.add(score.id);
    }
  }
  return capture;
}

export function renderScoreReport(capture,{presentation='screen',language='en'}={}){
  validateScoreReport(capture);const text=(key,values)=>escape(message(language,key,values));
  const summary=capture.summary.map(row=>`<tr data-report-score="${escape(row.id)}" data-score-formula="${escape(row.method)}"><th scope="row">${escape(scoreDisplayName(row,language))}</th><td data-score-mean data-value="${row.mean??''}">${display(row.mean,language)}</td><td data-score-confidence-mean data-value="${row.confidence?.value??''}">${row.confidence?display(row.confidence.value,language):text('notApplicable')}</td><td>${row.knownDays} / ${row.eligibleDays}</td><td>${text('partialUnknown',{partial:row.partialDays,unknown:row.unknownDays})}</td></tr>`).join('');
  const daily=presentation==='print'?'':reportDayPagesMarkup('scores',capture.days.length,'data-score-report-days',{language});
  return `<section data-score-report data-score-report-method="${escape(capture.method)}"><h2>${text('title')}</h2><p class="method">${text('method')}</p><div class="nutrition-report-table-region" role="region" tabindex="0" aria-label="${text('region')}"><table class="nutrition-report-table score-report-table"><thead><tr><th>${text('score')}</th><th>${text('mean')}</th><th>${text('confidence')}</th><th>${text('knownDays')}</th><th>${text('coverage')}</th></tr></thead><tbody>${summary}</tbody></table></div>${capture.days.length?'':`<p data-score-report-empty>${text('empty')}</p>`}<ul class="method">${capture.limitations.map(value=>`<li>${escape(scoreReportGuidanceText(value,language))}</li>`).join('')}</ul>${daily}</section>`;
}
export function renderScoreDays(days,summary,{language='en'}={}){
 const identities=new Map(summary.map(row=>[row.id,row])),text=(key,values)=>escape(message(language,key,values));
 return `<div class="nutrition-report-table-region" role="region" tabindex="0" aria-label="${text('dailyRegion')}"><table class="nutrition-report-table"><thead><tr><th>${text('date')}</th><th>${text('score')}</th><th>${text('value')}</th><th>${text('components')}</th></tr></thead><tbody>${days.map(day=>day.scores.map(score=>`<tr data-score-date="${day.date}" data-daily-score="${escape(score.id)}"><td>${day.date}</td><th scope="row">${escape(scoreDisplayName(identities.get(score.id),language))}</th><td data-value="${score.value??''}">${display(score.value,language)}</td><td>${text('measured',{known:score.coverage.known,total:score.coverage.total,coverage:message(language,score.coverage.complete?'complete':'partial')})}${score.gate?' · '+escape(formatScoreGate(score.gate,language)):''}${score.display?' · '+escape(formatScoreDisplay(score.display,language)):''}${score.confidence?' · '+escape(formatScoreConfidence(score.confidence,language)):''}</td></tr>`).join('')).join('')}</tbody></table></div>`;
}
