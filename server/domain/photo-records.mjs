import {photoPortionEvidence} from './photo-portion-estimate.mjs';
import {reviewedFoodRows} from './reviewed-food-records.mjs';
const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function exactFields(value,required,optional=[]){if(!object(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>![...required,...optional].includes(key)))invalid('Photo review metadata contains missing or unsupported fields.');}

export function photoReviewMetadata(value){
  exactFields(value,['version','photo','rows','modifiedAfterReview']);
  if(value.version!==1||typeof value.modifiedAfterReview!=='boolean')invalid('Choose version 1 photo review metadata and an explicit modification flag.');
  return {version:1,photo:photoMetadata(value.photo),rows:reviewedFoodRows(value.rows),modifiedAfterReview:value.modifiedAfterReview};
}
/** Every retained meal-photo reference, including library-only source images. */
export function mealPhotoIds(state){
  const ids=new Set();
  for(const entry of state.entries??[])if(entry.photo!==undefined)ids.add(photoMetadata(entry.photo).id);
  for(const key of ['recipes','meals'])for(const item of state[key]??[])if(item.photoReview!==undefined)ids.add(photoReviewMetadata(item.photoReview).photo.id);
  return [...ids];
}
export function photoAnalysis(value){
  if(value===null||value===undefined)return null;
  if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.observations)||value.observations.length>20||typeof value.notes!=='string'||value.notes.length>2000||Object.keys(value).some(key=>!['observations','possibleAdditions','notes'].includes(key)))invalid('Photo analysis must contain up to 20 food observations and bounded notes.');
  if(value.possibleAdditions!==undefined&&(!Array.isArray(value.possibleAdditions)||value.possibleAdditions.length>8))invalid('Photo analysis can contain up to 8 possible additions.');
  const descriptions=(items,estimates=false)=>items.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(key=>![...['description','preparation','uncertainty'],...(estimates?['portionEstimate']:[])].includes(key))||typeof item.description!=='string'||!item.description.trim()||item.description.length>300||typeof item.preparation!=='string'||item.preparation.length>100||typeof item.uncertainty!=='string'||item.uncertainty.length>500)invalid('Each photo observation needs a food description, preparation and uncertainty.');
    return {description:item.description,preparation:item.preparation,uncertainty:item.uncertainty,...photoPortionEvidence(item)};
  });
  const observations=descriptions(value.observations,true);
  const possibleAdditions=value.possibleAdditions===undefined?undefined:descriptions(value.possibleAdditions);
  if(possibleAdditions?.some(item=>!item.uncertainty.trim()||item.preparation!==''))invalid('Possible additions need an explanation and cannot claim observed preparation.');
  return {observations,notes:value.notes,...(possibleAdditions!==undefined?{possibleAdditions}:{})};
}
export function photoMetadata(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.id!=='string'||!/^[a-f0-9]{64}$/.test(value.id))invalid('Choose a valid saved meal photo.');
  if(typeof value.description!=='string'||!value.description.trim()||value.description.length>500)invalid('Photo food description must contain 1 to 500 characters.');
  if(!['Codex CLI','Google Gemini','Google Cloud Vision','Manual review'].includes(value.provider))invalid('Choose a supported photo review provider.');
  const result={id:value.id,description:value.description.trim(),provider:value.provider,...photoPortionEvidence(value)};
  if(value.preparation!==undefined){if(typeof value.preparation!=='string'||value.preparation.length>100)invalid('Photo preparation must be text up to 100 characters.');if(value.preparation)result.preparation=value.preparation;}
  if(value.provider!=='Google Cloud Vision'&&value.labels===undefined)return {...result,analysis:photoAnalysis(value.analysis)};
  // Historical labels are retained on existing records and imports. Codex results
  // use observations and never acquire synthetic label scores.
  if(['Codex CLI','Google Gemini'].includes(value.provider))invalid('Meal recognition uses observations, not scored labels.');
  if(!Array.isArray(value.labels)||value.labels.length>30)invalid('Photo labels must contain at most 30 items.');
  const labels=value.labels.map(label=>{
    if(!label||typeof label.description!=='string'||!label.description.trim()||label.description.length>300||typeof label.score!=='number'||!Number.isFinite(label.score)||label.score<0||label.score>1)invalid('Photo labels need a description and a score from 0 to 1.');
    const result={description:label.description,score:label.score};
    if(label.topicality!==undefined){if(typeof label.topicality!=='number'||!Number.isFinite(label.topicality)||label.topicality<0||label.topicality>1)invalid('Photo label topicality must be from 0 to 1.');result.topicality=label.topicality;}
    if(label.mid!==undefined){if(typeof label.mid!=='string'||label.mid.length>300)invalid('Photo label identity is too long.');result.mid=label.mid;}
    return result;
  });
  return {...result,labels};
}
