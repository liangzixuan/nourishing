import {parseTextLog,evaluateTextReview} from './domain/text-log.mjs';
import {recipeImportCatalog} from './recipe-import.mjs';
import {digest} from './data-codec.mjs';
import {textReviewMetadata} from './domain/text-records.mjs';
import {reviewedRowEvidence} from './domain/reviewed-foods.mjs';
import {act} from './domain/workspace.mjs';

export const textLogCommandFields={'text.log':['originalText','date','time','group','rows']};
const fail=message=>{throw Object.assign(Error(message),{status:400,code:400,publicMessage:message});};
export function validateTextLog(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!textLogCommandFields['text.log'].includes(key)))fail('Choose supported text log fields.');
 if(typeof input.originalText!=='string'||!input.originalText.trim()||input.originalText.length>10000)fail('Enter 1 to 10,000 characters.');
 if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>30)fail('Choose 1 to 30 foods.');
 for(const row of input.rows){
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(key=>!['foodId','amount','quantity','unit','portionId','lineIndex','confirmed'].includes(key))||typeof row.foodId!=='string'||!row.foodId||row.foodId.length>200||row.confirmed!==true)fail('Confirm each selected food and amount.');
  if(row.lineIndex!==undefined&&(!Number.isInteger(row.lineIndex)||row.lineIndex<0||row.lineIndex>=30))fail('Choose an original food line.');
  if(row.quantity!==undefined?row.amount!==undefined||typeof row.quantity!=='number'||!Number.isFinite(row.quantity)||row.quantity<=0:typeof row.amount!=='number'||!Number.isFinite(row.amount)||row.amount<=0||row.unit!==undefined||row.portionId!==undefined)fail('Enter a positive amount.');
 }
}

/** Manual line parsing and quantity conversion stay with the imported source owner. */
export function parseTextFoodLog(state,catalog,input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key!=='originalText'))throw Object.assign(Error('Enter food names and amounts.'),{status:400,code:400});
 const result=parseTextLog(input,{foodCatalog:recipeImportCatalog(catalog),foods:state.foods});
 return {revision:digest(state),originalText:result.originalText,rows:result.rows.map(row=>{
  const candidate=row.candidates.find(item=>item.ref.id===row.selection?.id&&item.ref.kind===row.selection?.kind),quantity=row.conversion.status==='resolved'?row.conversion.sourceQuantity:null;
  return {id:row.id,lineIndex:Number(row.id),phrase:row.phrase,name:candidate?.name??row.description,foodId:row.selection?.id??null,quantity:quantity?structuredClone(quantity):null,needsReview:!candidate||candidate.status!=='exact',candidates:row.candidates};
 })};
}

/** Catalog capture and cloud revision/receipt checks happen before this transaction. */
export function applyTextLog(state,input){
 validateTextLog(input);
 const candidate=structuredClone(state),foodCatalog={get:id=>candidate.foods.find(food=>food.id===id),getOriginal:()=>null,search:()=>({items:[],total:0})};
 const parsed=parseTextLog({originalText:input.originalText},{foods:[],foodCatalog:{...foodCatalog,get:()=>null}}),source={originalText:input.originalText,provider:'Manual lines',notes:''};
 const rows=input.rows.map((row,index)=>{
  const original=row.lineIndex===undefined?null:parsed.rows[row.lineIndex],food=candidate.foods.find(item=>item.id===row.foodId);
  if(!food)fail('This food is unavailable. Choose another match.');if(row.lineIndex!==undefined&&!original)fail('Choose an original food line.');
  return {id:original?.id??'manual:'+index,phrase:original?.phrase??null,description:original?.description??food.name,preparation:original?.preparation??'',uncertainty:'',selection:{kind:food.readOnly?'catalog':'library',id:food.id},confirmed:true,override:row.quantity===undefined?{quantity:row.amount,unit:'servings'}:{quantity:row.quantity,unit:row.unit,...(row.portionId!==undefined?{portionId:row.portionId}:{})}};
 });
 const review=evaluateTextReview({...source,date:input.date,time:input.time,group:input.group,rows},{state:candidate,foods:candidate.foods,settings:candidate.settings,foodCatalog});
 if(!review.canSave)fail('Check the selected foods and amounts.');const entryIds=[];
 for(const [index,row] of review.rows.entries()){
  const textReview=textReviewMetadata({version:1,...source,observations:[{id:row.id,phrase:row.phrase,uncertainty:row.uncertainty,override:row.override}],rows:[reviewedRowEvidence(row)],modifiedAfterReview:false});
  act(candidate,'entry.add',{...review.items[index],date:input.date,time:input.time,group:input.group,textReview});entryIds.push(candidate.entries.at(-1).id);
 }
 Object.assign(state,candidate);return {textId:review.textId,entryIds};
}
