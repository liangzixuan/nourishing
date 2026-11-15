import {textGuidanceFields} from './text-review-guidance.mjs';
import {ingredientWarning} from './ingredient-warning.mjs';
import {reviewSuggestedMealChange,saveSuggestedMealEntries} from './suggested-meal-adjustment.mjs';
import {preparationDescription} from './ingredient-preparation.mjs';
import {createHash} from 'node:crypto';
import {parseIngredientLine,convertIngredient} from './recipe-ingredients.mjs';
import {matchIngredient} from './recipe-matching.mjs';
import {textReviewSource,textReviewObservations,textReviewMetadata} from './text-records.mjs';
import {evaluateReviewedFoods,saveReviewedFoods,reviewedRowEvidence,reviewedIngredient,foodReviewContext} from './reviewed-foods.mjs';
const invalid=message=>{throw Object.assign(Error(message),{status:400});};
const textId=text=>createHash('sha256').update(text).digest('hex');
const source=input=>textReviewSource({originalText:input.originalText,provider:input.provider,notes:input.notes});
const observations=rows=>rows.map(row=>({id:row.id,phrase:row.phrase,uncertainty:row.uncertainty,...textGuidanceFields(row),override:row.override}));
const cancelled=signal=>{if(signal?.aborted)throw Object.assign(Error('Text analysis was cancelled.'),{status:499});};
function parseTextQuantity(row){
  const multiline=typeof row.phrase==='string'&&/[\r\n]/u.test(row.phrase);
  const parsed=parseIngredientLine(multiline?'unmeasured food':row.phrase??(row.description||'Manual food'),row.id);
  if(multiline){parsed.original=row.phrase;parsed.issues.push(ingredientWarning('multiline-source'));}
  return parsed;
}
function textQuantity(row,food,context,parsed=parseTextQuantity(row)){
  const override=row.override===null?null:{...row.override,unit:row.override.unit==='servings'?'serving':row.override.unit};
  const conversion=!food?{status:'needs-review',amount:null,grams:null,reason:{code:'choose-food'}}:row.phrase===null&&override===null?{status:'needs-review',amount:null,grams:null,reason:{code:'manual-food-quantity'}}:convertIngredient(parsed,food,{original:context.original(food),override});
  const quantity=conversion.status==='resolved'?conversion.sourceQuantity:null;
  return {quantity:quantity?.quantity??quantity?.amount??row.override?.quantity??null,unit:quantity?.unit??(quantity?.amount!==undefined?'servings':row.override?.unit??'g'),portionId:quantity?.portionId??row.override?.portionId??'',conversion,parsed};
}
export function matchTextLog(input,{foodCatalog,foods}){
  const {originalText,provider,notes}=source(input);
  if(!Array.isArray(input.observations))invalid('Provide text observations to match.');
  const evidence=textReviewObservations(input.observations.map(row=>({id:row?.id,phrase:row?.phrase,uncertainty:row?.uncertainty,...textGuidanceFields(row),override:null})),originalText);
  const items=input.observations.map((item,index)=>{
    if(typeof item.description!=='string'||!item.description.trim()||item.description.length>500||typeof item.preparation!=='string'||item.preparation.length>100)invalid('Text observations need a food description and preparation.');
    const {id,phrase,uncertainty}=evidence[index];return {id,phrase,uncertainty,...textGuidanceFields(evidence[index]),description:item.description,preparation:item.preparation};
  });
  const context=foodReviewContext(foodCatalog,foods);
  const rows=items.map(item=>{
    const ingredient=reviewedIngredient(item.description,item.preparation,item.id),parsed=parseTextQuantity(item),matched=matchIngredient(ingredient,{foodCatalog,foods,limit:5,supportsQuantity:parsed.quantity!==null&&!parsed.issues.length?ref=>{
      const food=context.get(ref);return convertIngredient(parsed,food,{original:context.original(food)}).status==='resolved';
    }:undefined});
    const row={...item,selection:matched.selection??null,confirmed:false,override:null},food=row.selection?context.get(row.selection):null;
    return {...row,...textQuantity(row,food,context,parsed),candidates:matched.candidates};
  });
  return {originalText,textId:textId(originalText),provider,notes,observations:items,rows};
}
export function textLogStatus({analyzer}){return analyzer.status();}
export function parseTextLog(input,context){
  const {originalText}=textReviewSource({originalText:input.originalText,provider:'Manual lines',notes:''}),lines=originalText.split(/\r\n|\r|\n/u).filter(line=>line.trim());
  if(lines.length>30)invalid('Use up to 30 nonblank food lines.');
  const items=lines.map((phrase,index)=>{const parsed=parseIngredientLine(phrase,String(index));return {id:String(index),phrase,description:(parsed.alternatives?phrase:parsed.query||parsed.description||phrase).slice(0,500),preparation:parsed.alternatives?'':preparationDescription(parsed.preparation).slice(0,100),uncertainty:''};});
  return matchTextLog({originalText,provider:'Manual lines',notes:'',observations:items},context);
}
export async function analyzeTextLog(input,{analyzer,foodCatalog,foods,signal}){
  cancelled(signal);if(input.consent!==true)invalid('Confirm that this food description may be sent to OpenAI through Codex CLI.');
  const {originalText}=textReviewSource({originalText:input.originalText,provider:'Codex CLI',notes:''}),status=await analyzer.status();cancelled(signal);
  if(!status.configured)throw Object.assign(Error(status.message||'Sign in to Codex CLI. Local line matching remains available.'),{status:503});
  const result=await analyzer.analyze(originalText,{signal});cancelled(signal);
  return matchTextLog({originalText,provider:'Codex CLI',notes:result.notes,observations:result.observations},{foodCatalog,foods});
}
function evaluateText(input,context){
  const mealChange=reviewSuggestedMealChange(input,context.state);
  const captured=source(input);if(!Array.isArray(input.rows))invalid('Review the food rows before saving.');
  const parsedObservations=textReviewObservations(input.rows.map(row=>({id:row?.id,phrase:row?.phrase,uncertainty:row?.uncertainty??'',...textGuidanceFields(row),override:row?.override??null})),captured.originalText,{draft:true});
  const prepared={...input,rows:input.rows.map((row,index)=>({...row,...parsedObservations[index]}))},identity=textId(captured.originalText);
  const result=evaluateReviewedFoods(prepared,context,{tokenSource:{textId:identity,source:captured,mealChange},quantityForRow:textQuantity,rowExtras:row=>({phrase:row.phrase,uncertainty:row.uncertainty,...textGuidanceFields(row),override:row.override}),tokenRows:rows=>rows.map(row=>({...reviewedRowEvidence(row),phrase:row.phrase,uncertainty:row.uncertainty,...textGuidanceFields(row),override:row.override})),includeOriginals:true});
  return {...result,review:{source:{textId:identity,...captured},textId:identity,mealChange,...result.review}};
}
export function evaluateTextReview(input,context){return evaluateText(input,context).review;}
export function saveTextReview(store,input,{foodCatalog,reviewSaves,afterSave,createFastingPrompt,isFastingPromptCurrent}){
  const captured=source(input),identity=textId(captured.originalText);
  const metadata=(review,index)=>{const rows=index===undefined?review.rows:[review.rows[index]];return {textReview:textReviewMetadata({version:1,...captured,observations:observations(rows),rows:rows.map(reviewedRowEvidence),modifiedAfterReview:false})};};
  return saveReviewedFoods(store,input,{kind:'text',reviewSaves,afterSave,createFastingPrompt,isFastingPromptCurrent,evaluate:state=>evaluateText(input,{state,foodCatalog,foods:state.foods,settings:state.settings,reviewSaves}),source:{...(input.suggestedMeal!==undefined||input.adjustMeal!==undefined?{saveDiary:(state,review)=>saveSuggestedMealEntries(store,state,input,review,metadata)}:{}),identity:{textId:identity},entryMetadata:metadata,libraryMetadata:review=>metadata(review)}});
}
