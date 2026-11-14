/** Public web JHj/KHj/zzk/NHj availability arithmetic.
 * The caller owns food lookup, filtering, source identity and nutrient maps.
 * Each entry is {amount,food}; food is null when lookup failed, otherwise
 * {kind,sourceDatabase,classification,measurements,ingredients?}.
 * Measurements are resolved finite values or null. Parent IDs come from the
 * nutrient registry. No source identity is inferred from a display name.
 * This module does not change measured intake or completeness counts. */
export const sourceDataQualityMethod='public-web-food-data-quality-v1';
const present=(food,id)=>id!==null&&food.measurements[id]!==undefined&&food.measurements[id]!==null;

function available(entry,nutrient,descend,depth){
 const food=entry.food;
 if(food===null)return 0;
 if((food.kind==='recipe'||food.kind==='meal')&&descend){
  let sum=0,count=0;
  for(const child of food.ingredients){
   // Source fallback uses the parent map if any nonzero child is unavailable.
   if(child.amount!==0&&child.food===null)return available(entry,nutrient,false,0);
   count++;sum+=available(child,nutrient,depth<5,depth+1);
  }
  return count>0?sum/count:0;
 }
 if(present(food,nutrient.id))return 1;
 if(food.sourceDatabase==='CRDB'&&food.classification==='supplement')return present(food,nutrient.parentId)?0:1;
 return 0;
}

/** Quantity does not weight availability; zero-quantity entries still count. */
export function sourceFoodAvailability(entry,nutrient){return available(entry,nutrient,true,0);}

/** Caller-selected nutrients permit both visible-nutrient Data Quality and
 * per-score confidence without conflating either with leaf completeness. */
export function captureSourceDataQuality(entries,nutrients){
 const foodEntryCount=entries.length;
 const rows=nutrients.map(nutrient=>{let availabilitySum=0;for(const entry of entries)availabilitySum+=sourceFoodAvailability(entry,nutrient);return {id:nutrient.id,parentId:nutrient.parentId,availabilitySum,foodEntryCount,ratio:foodEntryCount?availabilitySum/foodEntryCount:0};});
 const rawValue=rows.length?100*rows.reduce((sum,row)=>sum+row.ratio,0)/rows.length:0;
 return {method:sourceDataQualityMethod,rawValue,value:Math.round(rawValue),foodEntryCount,nutrientCount:rows.length,nutrients:rows};
}
