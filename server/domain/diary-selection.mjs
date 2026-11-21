import {contentDigestInput} from './content-digest-input.mjs';
import {withoutFoodNotes} from './food-notes.mjs';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex,utf8ToBytes} from '@noble/hashes/utils.js';
import {fail,array,objectKeys,exactId} from './workspace-validation.mjs';
import {date} from './calendar.mjs';
import {collectResourceDependencies} from './resource-dependencies.mjs';
import {withoutLibraryStatus} from './library-status.mjs';
import {entryFacts,isExerciseEntry} from './nutrition.mjs';
import {resourceReference} from './resource-reference.mjs';
import {expandResourceQuantity} from './resource-expansion.mjs';
import {parseServingAmount} from './food-quantity.mjs';
import {parseCarbohydrateBasis} from './carbohydrate-policy.mjs';
import {nutrients} from './nutrient-values.mjs';
import {recordCopyLineage} from './diary-record-copy.mjs';
import {parseEnergyUnit} from './energy-units.mjs';
import {clearAmountWarningCodes} from './diary-clear-contract.mjs';
const hash=value=>bytesToHex(sha256(utf8ToBytes(contentDigestInput(value))));
export function referencedRecordFacts(s,records){
  const graph=collectResourceDependencies(s,records);if(graph.missing.length)fail('A referenced food, recipe or meal is missing.');
  return ['foods','recipes','meals'].flatMap(collection=>graph[collection].map(({_pending,...record})=>({collection,id:record.id,record:withoutFoodNotes(withoutLibraryStatus(record))})));
}

export const copyCollections=['entries','biometrics','notes'];
export function prepareRecordSelection(s,selection){
  objectKeys(selection,['date','scope','records','group','revision'],'Record selection');
  if(selection.revision!==undefined&&(selection.scope!=='selected'||typeof selection.revision!=='string'||!/^[a-f0-9]{64}$/.test(selection.revision)))fail('Copied selection revision is invalid.');
  const sourceDate=date(selection.date);
  let normalized,records;
  if(selection.scope==='selected'){
    if(selection.group!==undefined)fail('Selected records cannot also select a group.');
    const seen=new Set(),refs=array(selection.records,'Selected records').map(ref=>{
      objectKeys(ref,['collection','id'],'Selected record');if(!copyCollections.includes(ref.collection))fail('Choose a diary record collection.');
      const id=exactId(ref.id),key=JSON.stringify([ref.collection,id]);if(seen.has(key))fail('Select each record once.');seen.add(key);return {collection:ref.collection,id};
    });
    normalized={date:sourceDate,scope:'selected',records:refs};records=refs.map(ref=>{const row=s[ref.collection].find(item=>item.id===ref.id);if(!row||row.date!==sourceDate)throw Object.assign(Error('A selected record no longer belongs to this date. Review the records again.'),{status:409});return {collection:ref.collection,row};});
  }else if(selection.scope==='group'){
    if(selection.records!==undefined||typeof selection.group!=='string'||!s.settings.groups.includes(selection.group))fail('Choose an existing source group without a record selection.');
    normalized={date:sourceDate,scope:'group',group:selection.group};records=copyCollections.flatMap(collection=>s[collection].filter(row=>row.date===sourceDate&&row.group===selection.group).map(row=>({collection,row})));
  }else if(selection.scope==='day'){
    if(selection.records!==undefined||selection.group!==undefined)fail('A full day cannot also select records or a group.');
    normalized={date:sourceDate,scope:'day'};records=copyCollections.flatMap(collection=>s[collection].filter(row=>row.date===sourceDate).map(row=>({collection,row})));
  }else fail('Choose selected records, a diary group or a full day.');
  if(selection.revision!==undefined){if(selection.revision!==recordSelectionRevision(s,records))throw Object.assign(Error('The copied records or their foods changed. Copy the selection again before pasting.'),{status:409});normalized.revision=selection.revision;}
  return {selection:normalized,records};
}

export function recordSelectionRevision(s,records){return hash({records,resources:referencedRecordFacts(s,records.filter(item=>item.collection==='entries').map(item=>item.row))});}
export function captureRecordSelection(s,input){
  const prepared=prepareRecordSelection(s,input);if(!prepared.records.length)fail('Select at least one record to copy.');
  return {selection:{date:prepared.selection.date,scope:'selected',records:prepared.records.map(({collection,row})=>({collection,id:row.id})),revision:recordSelectionRevision(s,prepared.records)},total:prepared.records.length};
}
export function prepareRecordCopy(s,p){
  objectKeys(p,['selection','destination'],'Record copy review');
  const destination=p.destination;objectKeys(destination,['date','group'],'Copy destination');const targetDate=date(destination.date);
  if(!Object.hasOwn(destination,'group')||(destination.group!==null&&(typeof destination.group!=='string'||!s.settings.groups.includes(destination.group))))fail('Choose an existing destination group or keep the original groups.');
  const {selection:normalized,records}=prepareRecordSelection(s,p.selection);
  const target={date:targetDate,group:destination.group},collections=new Set(records.map(item=>item.collection)),groups=new Set(records.filter(item=>item.collection==='entries').map(item=>target.group??item.row.group));
  const targets=copyCollections.filter(collection=>collections.has(collection)).flatMap(collection=>s[collection].filter(row=>row.date===targetDate&&(collection!=='entries'||groups.has(row.group))).map(row=>({collection,row})));
  const fingerprint=hash({selection:normalized,destination:target,records,resources:referencedRecordFacts(s,records.filter(item=>item.collection==='entries').map(item=>item.row)),targets});
  return {selection:normalized,destination:target,records,targets,fingerprint};
}

export function prepareSelectionDraft(s,input){
  objectKeys(input,['kind','selection'],'Reusable item selection');if(!['recipe','meal'].includes(input.kind))fail('Choose a recipe or meal draft.');
  const {selection,records}=prepareRecordSelection(s,input.selection);
  if(!records.length)fail('Select at least one food entry.');
  if(records.some(item=>item.collection!=='entries'||isExerciseEntry(item.row)))fail('Select food, recipe or meal entries only. Activities, measurements and notes cannot become ingredients.');
  const libraryIds=Object.fromEntries(['foods','recipes','meals'].map(collection=>[collection,s[collection].map(row=>row.id)]));
  const fingerprint=hash({kind:input.kind,selection,records,resources:referencedRecordFacts(s,records.map(item=>item.row)),libraryIds});
  const inlineFoods=[],usedIds=new Set(libraryIds.foods),rows=[];let expanded=false;
  const append=row=>{if(rows.length>=1000)fail('This selection expands beyond the 1,000-item recipe or meal format. Select fewer entries.');rows.push(row);};
  for(const {row}of records){
    const reference=resourceReference(row);
    if(!reference){
      if(!row.nutrients||typeof row.nutrients!=='object')fail('This entry has no reusable food reference or nutrient facts.');
      let index=0,id;do{id='draft-food:'+hash({id:row.id,date:row.date,index:index++});}while(usedIds.has(id));usedIds.add(id);
      const food={id,name:row.name,serving:'1 recorded serving',grams:null,nutrients:nutrients(row.nutrients),...parseCarbohydrateBasis(row),source:{name:'Diary entry snapshot',entryId:row.id,date:row.date}};
      inlineFoods.push(food);append({foodId:id,amount:parseServingAmount(row.amount)});continue;
    }
    if(reference==='mealId'||row.recipeOverride)expanded=true;
    for(const item of expandResourceQuantity(s,row,{target:'items'}))append(item.source);
  }
  const draft=input.kind==='recipe'?{name:`Recipe from ${selection.date}`,servings:1,cookedWeightGrams:null,ingredients:rows,instructions:'',source:`Diary selection ${selection.date}`}:{name:`Meal from ${selection.date}`,items:rows};
  const warningCodes=['original-records'];
  if(expanded)warningCodes.push('expanded-items');
  if(inlineFoods.length)warningCodes.push('inline-snapshots');
  if(input.kind==='recipe')warningCodes.push('unmeasured-cooked-weight');
  return {kind:input.kind,selection,fingerprint,draft,inlineFoods,selectedCount:records.length,warningCodes};
}

export function reviewQuantity(facts){return facts.quantity===undefined?{kind:'servings',value:facts.amount}:facts.unit==='batch'?{kind:'batch',value:facts.quantity}:facts.unit==='portion'?{kind:'portion',value:facts.quantity,label:facts.portionLabel}:{kind:'measurement',value:facts.quantity,unit:facts.unit};}
function copyPresentationFacts(s,collection,row){
  if(collection==='notes'){if(typeof row.text!=='string')fail('The source note has no valid text.');return {name:null,detail:{kind:'note',text:row.text.length>160?row.text.slice(0,159)+'…':row.text}};}
  if(collection==='biometrics')return {name:row.type,detail:{kind:'measurement',value:row.value,unit:row.unit}};
  if(row.kind==='exercise')return {name:row.name,detail:{kind:'exercise',duration:row.duration,caloriesBurned:row.caloriesBurned??null}};
  const facts=entryFacts(s,row);return {name:facts.name,detail:{kind:'quantity',quantity:reviewQuantity(facts)}};
}
export function previewRecordCopy(s,p){
  const prepared=prepareRecordCopy(s,p),counts={entries:0,biometrics:0,notes:0};let repeatedEntryCount=0,healthImportedCount=0;
  const items=prepared.records.map(({collection,row})=>{
    recordCopyLineage(row,collection);
    counts[collection]++;const healthImported=!!(row.source||row.copiedFrom?.source),repeatLinked=!!(row.repeatId||row.copiedFrom?.repeatId);if(healthImported)healthImportedCount++;if(repeatLinked)repeatedEntryCount++;
    return {collection,id:row.id,...copyPresentationFacts(s,collection,row),time:row.time,...(Object.hasOwn(row,'group')?{group:row.group}:{}),hasPhoto:!!row.photo||(collection==='notes'&&!!row.imageId),healthImported,repeatLinked};
  });
  return {version:1,energyUnit:parseEnergyUnit(s.settings.energyUnit??'kcal'),selection:prepared.selection,destination:prepared.destination,fingerprint:prepared.fingerprint,counts,total:items.length,items,repeatedEntryCount,healthImportedCount,targetCount:prepared.targets.length};
}


export function previewClearAmounts(s,input){
  objectKeys(input,['selection'],'Clear amounts review');
  const prepared=prepareRecordSelection(s,input.selection),records=prepared.records.filter(({collection,row})=>collection==='entries'&&!isExerciseEntry(row));
  if(!records.length)fail('No food entries are selected to clear.');
  const selection={date:prepared.selection.date,scope:'selected',records:records.map(({row})=>({collection:'entries',id:row.id}))};
  return {selection,fingerprint:recordSelectionRevision(s,records),total:records.length,changed:records.filter(({row})=>(row.quantity??row.amount)!==0).length,
    examples:records.slice(0,10).map(({row})=>{const facts=entryFacts(s,row);return {id:row.id,name:facts.name,amount:row.amount??null,quantity:row.quantity??null,unit:row.unit??null,portionLabel:facts.portionLabel??null};}),
    warningCodes:[...clearAmountWarningCodes]};
}
