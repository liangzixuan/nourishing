import {sourceAttributions} from './catalog-source.mjs';
import {catalog} from './nutrient-catalog.mjs';
import {parseFoodNotes} from './food-notes.mjs';
import {parseFoodPrintRequest,validateFoodPrintCapture} from './food-print-contract.mjs';
export function createFoodPrintCapture(state,input,now=new Date()){
 const request=parseFoodPrintRequest(input),food=state.foods.find(row=>row.id===request.id);
 if(!food)throw Object.assign(Error('This saved food no longer exists. Open a saved food before printing.'),{status:404});
 const notes=parseFoodNotes(food);
 return validateFoodPrintCapture({version:2,attributions:sourceAttributions(food.source),request,capturedAt:now.toISOString(),food:{name:food.name,serving:food.serving,grams:food.grams,...(food.milliliters!==undefined?{milliliters:food.milliliters}:{}),barcode:food.barcode??'',...(request.includeNotes?{notes:notes.notes??''}:{})},nutrients:catalog.map(({id,name,category,unit})=>({id,name,category,unit,value:food.nutrients[id]??null})),dataQuality:food.dataQuality??''});
}
