import {parseScoreSelection,resolveScoreDisplay} from './nutrition-score-policy.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const fields=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail('Supply the required score display fields only.')};
export function parseScoreDisplay(value){fields(value,['show','selected']);if(typeof value.show!=='boolean')fail('Choose whether to show Nutrition Scores.');const selected=parseScoreSelection(value.selected);if(!selected.length)fail('Keep at least one selected score.');return {show:value.show,selected}}
/** One ordered selection owner is shared by the action and its mobile acknowledgement check. */
export function changeScoreDisplay(base,input){
 const value=parseScoreDisplay(base),selected=[...value.selected];
 if(input?.kind==='show'){fields(input,['kind','show']);if(typeof input.show!=='boolean')fail('Choose whether to show Nutrition Scores.');return {...value,show:input.show}}
 if(input?.kind==='add'){fields(input,['kind','scoreId']);parseScoreSelection([input.scoreId]);if(selected.length>=8||selected.includes(input.scoreId))fail('Choose a new score in an available slot.');selected.push(input.scoreId)}
 else if(input?.kind==='replace'||input?.kind==='remove'){
  fields(input,input.kind==='replace'?['kind','index','scoreId']:['kind','index']);if(!Number.isInteger(input.index)||input.index<0||input.index>=selected.length)fail('Choose a selected score.');
  if(input.kind==='remove'){if(selected.length===1)fail('Keep at least one selected score.');selected.splice(input.index,1)}
  else{parseScoreSelection([input.scoreId]);const other=selected.indexOf(input.scoreId);if(other>=0)selected[other]=selected[input.index];selected[input.index]=input.scoreId}
 }else fail('Choose a supported score display change.');
 return {show:value.show,selected:parseScoreSelection(selected)};
}
export function scoreDisplayPatch(settings,input){
 fields(input,['base','change']);const base=parseScoreDisplay(input.base),desired=changeScoreDisplay(base,input.change),current=resolveScoreDisplay(settings),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 if(equal(current,desired))return {};
 if(!equal(current,base))fail('Nutrition Scores changed. Reload before choosing again.',409);
 return input.change.kind==='show'?{showScores:desired.show}:{scoreSelection:desired.selected};
}
