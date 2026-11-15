import {formatMessage} from './message-format.js';
const scoreMessage=(language,key,values)=>formatMessage(language,'scoreDetail.'+key,values);
const scoreNumber=(value,language)=>value.toLocaleString(language,{maximumFractionDigits:4});
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const amount=value=>finite(value)&&value>=0;
export const requiresScoreConfidence=(method,id)=>method?.startsWith('public-web-')&&id!=='dataQuality';
export function validScoreConfidence(c){return c&&Object.keys(c).length===4&&c.method==='public-web-food-data-quality-v1'&&Number.isSafeInteger(c.foodEntryCount)&&c.foodEntryCount>=0&&amount(c.value)&&c.value<=100&&Array.isArray(c.componentIds)&&new Set(c.componentIds).size===c.componentIds.length&&c.componentIds.every(id=>typeof id==='string'&&id.length>0);}
export function formatScoreConfidence(c,language='en'){return scoreMessage(language,'confidence',{value:scoreNumber(c.value,language),count:c.foodEntryCount});}
/** Validate captured arithmetic facts without recalculating intake or targets. */
export function validScoreGate(score){
 if(requiresScoreConfidence(score.method,score.id)){if(!validScoreConfidence(score.confidence)||score.confidence.foodEntryCount!==score.display?.foodEntryCount)return false;}else if(Object.hasOwn(score,'confidence'))return false;
 if(score.method?.startsWith('public-web-')){
  const d=score.display;
  if(!d||Object.keys(d).length!==3||!['formulaValue','foodEntryCount','reason'].every(k=>Object.hasOwn(d,k))||!finite(d.formulaValue)||!Number.isSafeInteger(d.foodEntryCount)||d.foodEntryCount<0||d.reason!==(d.foodEntryCount===0?'no-food-entries':'calculated')||score.value!==(d.foodEntryCount===0?0:Math.round(d.formulaValue)))return false;
  return validScoreFormula({...score,value:Math.round(d.formulaValue)});
 }
 return !Object.hasOwn(score,'display')&&validScoreFormula(score);
}
function validScoreFormula(score){
 if(score.method==='public-web-food-data-quality-v1')return amount(score.display.formulaValue)&&score.display.formulaValue<=100&& score.id==='dataQuality'&&!Object.hasOwn(score,'gate')&&amount(score.value)&&score.value<=100;
 if(score.method==='public-web-calcium-absorption-v1')return score.id==='calciumAbsorption'&&!Object.hasOwn(score,'gate')&&finite(score.value);
 if(score.method==='public-web-plant-v1')return score.id==='plant'&&!Object.hasOwn(score,'gate')&&finite(score.value);
 if(score.method==='public-web-antioxidant-v1')return score.id==='antioxidants'&&!Object.hasOwn(score,'gate')&&finite(score.value);
 if(score.method==='public-web-overall-v1')return score.id==='overall'&&!Object.hasOwn(score,'gate')&&finite(score.value);
 if(score.method==='public-web-progress-v1')return !Object.hasOwn(score,'gate')&&finite(score.value);
 if(score.method==='public-web-oral-v1')return score.id==='oral'&&!Object.hasOwn(score,'gate')&&finite(score.value);
 if(score.method!=='public-web-keto-v1')return !Object.hasOwn(score,'gate')&&(score.value===null||finite(score.value)&&score.value<=100)&&(score.value===null)===(score.coverage.known===0);
 const g=score.gate,keys=['mode','value','maximum','maximumOrigin','baseValue','penalty','status'];
 if(score.id!=='keto'||!g||Object.keys(g).length!==keys.length||!keys.every(k=>Object.hasOwn(g,k))||!['net','total'].includes(g.mode)||!(g.value===null||finite(g.value))||!(g.maximum===null||amount(g.maximum))||!['custom','population-ul','fixed','dynamic'].includes(g.maximumOrigin)||!finite(g.baseValue)||!finite(g.penalty)||g.penalty>Math.max(0,g.baseValue)||g.penalty<Math.min(0,g.baseValue)||score.value!==Math.round(g.baseValue-g.penalty))return false;
 if(g.status==='not-set')return g.maximum===null&&g.penalty===0;
 if(g.status==='unmeasured')return g.maximum!==null&&g.value===null&&g.penalty===0;
 if(g.value===null||g.maximum===null)return false;
 return g.status==='within'?g.value<=g.maximum&&g.penalty===0:g.status==='above'&&g.value>g.maximum;
}
export function formatScoreGate(g,language='en'){
 const name=scoreMessage(language,g.mode==='net'?'net':'total');
 if(g.status==='not-set')return scoreMessage(language,'notSet',{name});
 if(g.status==='unmeasured')return scoreMessage(language,'unmeasured',{name});
 return scoreMessage(language,'gate',{name,value:scoreNumber(g.value,language),maximum:scoreNumber(g.maximum,language),penalty:scoreNumber(g.penalty,language),base:scoreNumber(g.baseValue,language)});
}
export function formatScoreDisplay(display,language='en'){
 return display.reason==='no-food-entries'?scoreMessage(language,'noFood',{value:scoreNumber(display.formulaValue,language)}):scoreMessage(language,'rounded',{count:display.foodEntryCount});
}
