import {localWorkspaceState} from '../local-engine.js';
import {calculateDailyNutrition,calculateSelectionNutrition,recipeNutrition} from '../report-source/server/nutrition.mjs';
import {resolveFoodQuantity} from '../report-source/server/food-quantity.mjs';
import {resolveScoreDisplay} from '../report-source/server/nutrition-score-policy.mjs';

const summary=day=>Object.fromEntries(['attributions','totals','targets','nutrientCoverage','carbohydrate','scores','complete','logged'].map(key=>[key,day[key]]));

/** Only saved food references can use the account snapshot. Catalog references
 * remain remote because a local copy with the same ID may have been edited. */
function project(state,date,inputRows){
 if(!state||!inputRows.length||inputRows.some(row=>row.ref?.kind!=='library'))return null;
 const foods=inputRows.map(row=>state.foods.find(food=>food.id===row.ref.id));if(foods.some(food=>!food))return null;
 const rows=inputRows.map((row,index)=>{
  if(!Number.isFinite(row.quantity)||row.quantity<=0)throw Error('Enter a positive ingredient quantity.');
  const food=foods[index],quantity=row.unit==='servings'?{amount:row.quantity}:row,measured=resolveFoodQuantity(food,quantity),amount=measured?.amount??row.quantity;
  return {...row,name:food.name,serving:food.serving,servingGrams:food.grams??null,servingMilliliters:food.milliliters??null,servingTranslations:food.servingTranslations??[],amount,grams:measured?.grams??(Number.isFinite(food.grams)?amount*food.grams:null),source:food.source,portions:food.portions??[]};
 });
 const used=new Set(state.entries.map(row=>row.id));
 const entries=rows.map((row,index)=>{let id='suggestion-preview:'+index;while(used.has(id))id+=':';used.add(id);return {id,foodId:row.ref.id,amount:row.amount,date,group:state.settings.groups[0],time:''};});
 return {rows,entries,state:{...state,entries:[...state.entries,...entries]}};
}

export function projectSuggestedMeal(state,{date,rows}){
 const projected=project(state,date,rows);if(!projected)return null;
 const before=calculateDailyNutrition(state,date),after=calculateDailyNutrition(projected.state,date);
 const facts=recipeNutrition(state,{servings:1,ingredients:projected.entries.map(({foodId,amount})=>({foodId,amount}))});
 return {date,rows:projected.rows,meal:{totals:facts.nutrients,coverage:facts.coverage,carbohydrate:facts.carbohydrate,attributions:facts.attributions},before:summary(before),after:summary(after),highlighted:after.diaryDisplay.highlights.filter(row=>row.active).map(row=>row.id),scoreSelection:resolveScoreDisplay(state.settings).selected};
}
export async function localSuggestedMeal(input){return projectSuggestedMeal(await localWorkspaceState(),input);}
export async function localSuggestedIngredient({date,row}){
 const projected=project(await localWorkspaceState(),date,[row]);if(!projected)return null;
 return {row:projected.rows[0],nutrition:calculateSelectionNutrition(projected.state,date,[projected.entries[0].id])};
}
