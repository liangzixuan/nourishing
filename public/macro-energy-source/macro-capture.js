import {formatMessage} from '../report-source/public/message-format.js';
import {MACRO_TARGET_VERSION,isMacroGuidance} from '../report-source/server/macro-guidance.mjs';
import {validateSourceAttributions} from '../report-source/server/catalog-source.mjs';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const known=value=>value===null||typeof value==='number'&&Number.isFinite(value)&&value>=0;
const keys=['protein','carbohydrate','fat'],sources=new Set(['fixed','ratio','keto','weekday']);
export function validateMacroTargets(value,language='en'){
  validateSourceAttributions(value?.attributions);
  if(!object(value)||value.version!==MACRO_TARGET_VERSION||!['fixed','ratios','keto'].includes(value.mode)||!known(value.energyTarget)||!['carbs','netCarbohydrate'].includes(value.carbohydrateTargetId)||!Array.isArray(value.reasons)||!value.reasons.every(isMacroGuidance)||['derived','targets'].some(name=>!object(value[name])||keys.some(key=>!known(value[name][key])))||!object(value.sources)||keys.some(key=>!sources.has(value.sources[key])))throw Error(formatMessage(language,'macroCapture.incomplete'));
  if(value.mode!=='ratios'?(value.basis!==null||value.values!==null):(!['percent','kcal','grams'].includes(value.basis)||!object(value.values)||keys.some(key=>typeof value.values[key]!=='number'||!Number.isFinite(value.values[key])||value.values[key]<0)))throw Error(formatMessage(language,'macroCapture.ratioIncomplete'));
  return value;
}
