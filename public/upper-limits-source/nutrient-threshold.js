import {CaptureValidationError,captureValidationErrorText} from '../report-source/public/capture-errors.js';
import {isHttpsReferenceUrl} from '../report-source/public/reference-url.js';
import {displayValue,displayUnit} from '../report-source/public/energy-display.js';
import {thresholdMessage,upperLimitBasisLabel} from '../report-source/public/threshold-language.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const statuses=new Set(['above','within','partial','unknown']);

/** Validate captured facts only; the shared domain owns all comparisons. */
export function validateNutrientThreshold(value){
  if(value===null||value===undefined)return null;
  const coverage=value.coverage;
  if(!object(value)||typeof value.maximum!=='number'||!Number.isFinite(value.maximum)||value.maximum<0||!(value.value===null||typeof value.value==='number'&&Number.isFinite(value.value))||!statuses.has(value.status)||!object(coverage)||!Number.isInteger(coverage.known)||!Number.isInteger(coverage.total)||coverage.known<0||coverage.total<coverage.known||typeof coverage.complete!=='boolean')throw new CaptureValidationError('thresholdComparison');
  if((value.status==='unknown')!==(value.value===null)||value.status==='within'&&!coverage.complete||value.status==='partial'&&coverage.complete)throw new CaptureValidationError('thresholdCoverage');
  if(value.reference!==null&&value.reference!==undefined&&(!object(value.reference)||!isHttpsReferenceUrl(value.reference.url)||typeof value.intakeBasis!=='string'||typeof value.comparisonSupported!=='boolean'||!value.comparisonSupported&&(value.reason!=='restricted-form-unmeasured'||value.status!=='unknown')))throw new CaptureValidationError('thresholdScope');
  return value;
}

export function thresholdMarkup(threshold,unit,{energyUnit='kcal',language='en'}={}){
  let value;try{value=validateNutrientThreshold(threshold);}catch(error){if(error instanceof CaptureValidationError)throw new Error(captureValidationErrorText(error,language),{cause:error});throw error;}if(value===null)return '';
  const t=(key,values)=>thresholdMessage(language,key,values),displayUnitValue=displayUnit(unit,energyUnit),recorded=value.value===null?t('unknown'):String(displayValue(value.value,unit,energyUnit))+' '+displayUnitValue,maximum=String(displayValue(value.maximum,unit,energyUnit))+' '+displayUnitValue;
  const status=t('status.'+(value.reference?'population':'custom')+'.'+value.status),coverage=t(value.reason==='restricted-form-unmeasured'?'restricted':value.status==='unknown'?'unavailable':value.coverage.complete?'complete':'partial');
  return `<div class="nutrient-threshold nutrient-threshold--${value.status}" data-nutrient-threshold="${value.status}" data-maximum="${value.maximum}" data-value="${value.value??''}" data-unit="${escape(unit)}"><strong>${escape(status)}</strong><span>${escape(t('recordedMaximum',{recorded,maximum}))}</span><small>${escape(coverage)} ${escape(t('comparison'))}</small>${value.reference?`<small>${escape(t('basis',{basis:upperLimitBasisLabel(value.intakeBasis,language)}))} <a href="${escape(value.reference.url)}" target="_blank" rel="noopener noreferrer">${escape(t('source'))}</a></small>`:''}</div>`;
}
