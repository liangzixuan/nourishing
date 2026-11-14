import {isTextReviewGuidance,textGuidanceFields} from './text-review-guidance.mjs';
import {isQuantityUnit} from './quantity-units.mjs';
import {reviewedFoodRows} from './reviewed-food-records.mjs';

const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
function exact(value,required,optional=[]){if(!value||typeof value!=='object'||Array.isArray(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>![...required,...optional].includes(key)))invalid('Text review metadata contains missing or unsupported fields.');}
export function textReviewSource(value){
  exact(value,['originalText','provider','notes']);
  if(typeof value.originalText!=='string'||!value.originalText.trim()||value.originalText.length>10000)invalid('Source text must contain 1 to 10,000 characters.');
  if(!['Manual lines','Codex CLI'].includes(value.provider))invalid('Choose a supported text review provider.');
  if(typeof value.notes!=='string'||value.notes.length>2000)invalid('Text review notes must be text up to 2,000 characters.');
  return {originalText:value.originalText,provider:value.provider,notes:value.notes};
}
export function textReviewObservations(value,originalText,{draft=false}={}){
  if(typeof originalText!=='string'||!originalText.trim()||originalText.length>10000)invalid('Source text must contain 1 to 10,000 characters.');
  if(!Array.isArray(value)||value.length<(draft?0:1)||value.length>30)invalid('Retain up to 30 text review observations; saved reviews need at least one.');
  const ids=new Set();let cursor=0;
  return value.map(item=>{
    exact(item,['id','phrase','uncertainty','override'],['guidance']);
    if(Object.hasOwn(item,'guidance')&&!isTextReviewGuidance(item.guidance))invalid('Text review guidance must retain a code and literal text.');
    if(typeof item.id!=='string'||!item.id.trim()||item.id.length>100||ids.has(item.id.trim()))invalid('Text observation IDs must be nonempty and unique.');const id=item.id.trim();ids.add(id);
    if(typeof item.uncertainty!=='string'||item.uncertainty.length>500)invalid('Text uncertainty must be text up to 500 characters.');
    if(item.phrase!==null){
      if(typeof item.phrase!=='string'||!item.phrase.trim()||item.phrase.length>10000)invalid('Retain a nonempty literal source phrase.');
      const start=originalText.indexOf(item.phrase,cursor);if(start<0)invalid('Text phrases must occur literally in source order without overlap.');cursor=start+item.phrase.length;
    }else if(item.override===null&&!draft)invalid('A manually added food requires a reviewed quantity override.');
    let override=null;
    if(item.override!==null){
      exact(item.override,['quantity','unit'],['portionId']);
      const {quantity,unit,portionId}=item.override;
      if(!(isQuantityUnit(unit)||['portion','servings'].includes(unit))||!(draft&&quantity===null)&&(typeof quantity!=='number'||!Number.isFinite(quantity)||quantity<=0||quantity>(unit==='servings'?100000:1000000)))invalid('Text quantity override must be a positive supported quantity.');
      if(unit==='portion'&&(typeof portionId!=='string'||!portionId.trim()&&!(draft&&portionId==='')||portionId.length>200)||unit!=='portion'&&Object.hasOwn(item.override,'portionId'))invalid('Use an exact source portion ID only for a recorded portion.');
      override={quantity,unit,...(unit==='portion'?{portionId}:{})};
    }
    return {id,phrase:item.phrase,uncertainty:item.uncertainty,...textGuidanceFields(item),override};
  });
}
export function textReviewMetadata(value){
  exact(value,['version','originalText','provider','notes','observations','rows','modifiedAfterReview']);
  if(value.version!==1||typeof value.modifiedAfterReview!=='boolean')invalid('Choose version 1 text review metadata and an explicit modification flag.');
  const source=textReviewSource({originalText:value.originalText,provider:value.provider,notes:value.notes}),observations=textReviewObservations(value.observations,source.originalText),rows=reviewedFoodRows(value.rows);
  if(observations.length!==rows.length||rows.some((row,index)=>row.id!==observations[index].id))invalid('Retained text observations must match the reviewed food rows one-to-one in order.');
  return {version:1,...source,observations,rows,modifiedAfterReview:value.modifiedAfterReview};
}
