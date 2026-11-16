import {NET_CARBOHYDRATE_TARGET_ID} from '../report-source/server/carbohydrate-policy.mjs';
// Source presentation selector; all values and targets remain server projections.
export const mealImpactNutrient=(impact,nutrients,id)=>id==='tracked-carbohydrate'||id===NET_CARBOHYDRATE_TARGET_ID?{id:impact.after.carbohydrate.definition.mode==='net'?NET_CARBOHYDRATE_TARGET_ID:'carbs',name:impact.after.carbohydrate.label,unit:'g'}:nutrients.find(n=>n.id===id);
