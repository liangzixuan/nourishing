import {objectKeys,exactId,fail,maxRecordCollectionRows} from './workspace-validation.mjs';
import {date} from './calendar.mjs';
import {isExerciseEntry,calculateSummary} from './nutrition.mjs';
import {resourceReference} from './resource-reference.mjs';
import {recordSelectionRevision} from './diary-selection.mjs';
import {expandedDiarySources} from './resource-expansion.mjs';
import {DIARY_EXPANSION_VERSION} from './diary-expansion-contract.mjs';

export function previewEntryExpansion(s,input){
  objectKeys(input,['date','id'],'Diary expansion');const day=date(input.date),id=exactId(input.id);
  const original=s.entries.find(row=>row.id===id&&row.date===day);
  if(!original)throw Object.assign(Error('This diary entry is no longer available. Reload the diary before reviewing expansion.'),{status:409});
  if(isExerciseEntry(original)||!['recipeId','mealId'].includes(resourceReference(original)))fail('Choose a logged recipe or saved meal to expand.');
  const fingerprint=recordSelectionRevision(s,[{collection:'entries',row:original}]);
  const items=expandedDiarySources(s,original);
  if(!items.length)fail('This entry has no food ingredients to expand.');
  if(s.entries.length-1+items.length>maxRecordCollectionRows)fail('Expansion would exceed the 100000-entry workspace format.');
  const project=entries=>{const summary=calculateSummary({...s,entries,biometrics:[],notes:[]},day);return {attributions:summary.attributions,values:summary.totals,coverage:summary.nutrientCoverage};};
  const warningCodes=['replacement','retained'];
  if(original.photo)warningCodes.push('photo');
  if(original.repeatId!==undefined)warningCodes.push('repeat');
  if(original.copiedFrom)warningCodes.push('copy');
  return {version:DIARY_EXPANSION_VERSION,date:day,id,fingerprint,items,count:items.length,warningCodes,before:project([original]),after:project(items)};
}
