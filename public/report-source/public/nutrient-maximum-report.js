import {isHttpsReferenceUrl} from './reference-url.js';
import {CaptureValidationError} from './capture-errors.js';
import {displayValue,displayUnit} from './energy-display.js';
import {thresholdMessage,upperLimitBasisLabel} from './threshold-language.js';
const measured=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const count=value=>Number.isSafeInteger(value)&&value>=0;

/** Report and print consume the captured daily comparisons without recalculation. */
export function validateMaximumReport(row){
  const d=row?.maximumDays,r=row?.maximumRange,sources=row?.maximumSources;
  if(!row||typeof row.visible!=='boolean'||!(row.maximum===null||measured(row.maximum))||!d||['above','within','partial','unknown','eligible'].some(key=>!count(d[key]))||d.above+d.within+d.partial+d.unknown!==d.eligible||!Array.isArray(sources))throw new CaptureValidationError('maximumCapture');
  if(r!==null&&(!r||!measured(r.minimum)||!measured(r.maximum)||r.maximum<r.minimum||!count(r.knownDays)||!count(r.unavailableDays)||r.knownDays!==d.eligible||r.knownDays+r.unavailableDays!==row.eligibleDays))throw new CaptureValidationError('maximumRange');
  if(d.eligible>0&&r===null||row.maximum!==null&&r!==null&&(r.minimum!==row.maximum||r.maximum!==row.maximum||r.unavailableDays!==0))throw new CaptureValidationError('maximumRangeConsistency');
  for(const item of sources)if(!item||typeof item.intakeBasis!=='string'||typeof item.comparisonSupported!=='boolean'||typeof item.source?.title!=='string'||!isHttpsReferenceUrl(item.source?.url))throw new CaptureValidationError('maximumSource');
  return row;
}

export function maximumReportText(row,{energyUnit='kcal',language='en'}={}){
  validateMaximumReport(row);const d=row.maximumDays,r=row.maximumRange;
  if(row.maximum===null&&r===null)return '';
  const value=row.maximum===null?`${displayValue(r.minimum,row.unit,energyUnit)}–${displayValue(r.maximum,row.unit,energyUnit)}`:String(displayValue(row.maximum,row.unit,energyUnit));
  const t=(key,values)=>thresholdMessage(language,key,values),source=row.maximumSources.map(item=>' '+t('reportSource',{title:item.source.title,basis:upperLimitBasisLabel(item.intakeBasis,language),restriction:item.comparisonSupported?'':t('reportRestriction'),url:item.source.url})).join('');
  return t('report',{value,unit:displayUnit(row.unit,energyUnit),...d})+(r?.unavailableDays?' '+t('missingDays',{count:r.unavailableDays}):'')+source;
}
