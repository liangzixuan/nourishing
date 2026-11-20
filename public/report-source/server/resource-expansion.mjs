import {parseReferencedQuantity} from './resource-quantity.mjs';
import {parseFoodDiaryFields} from './diary-record-fields.mjs';

const fail=message=>{throw Object.assign(Error(message),{status:400});};

// Keep the recorded unit while scaling. Resolved amounts are used only to
// traverse a recipe; they never replace the source quantity on a food row.
export function scaleResourceQuantity(state,row,factor=1){
  const parsed=parseReferencedQuantity(state,row,{defaultAmount:1}),source={...parsed.source};
  if(source.quantity!==undefined)source.quantity*=factor;else source.amount*=factor;
  return parseReferencedQuantity(state,source);
}

export function expandResourceQuantity(state,row,{target='foods',limit=1000}={}){
  if(!['foods','items','children'].includes(target))fail('Choose food ingredients or meal items.');
  const rows=[];
  const append=(source,path)=>{if(rows.length>=limit)fail(`This selection expands beyond the ${limit.toLocaleString('en-US')}-item limit for this operation. Select fewer entries.`);rows.push({source,path});};
  const visit=(input,factor,path)=>{
    const parsed=scaleResourceQuantity(state,input,factor),source=parsed.source;
    if(source.foodId||(source.recipeId&&(target==='items'&&!source.recipeOverride||target==='children'&&path.length>0))){append(source,path);return;}
    if(source.recipeId){
      const fraction=(parsed.resolvedQuantity?.amount??source.amount)/parsed.resource.servings;
      for(const [index,item] of parsed.resource.ingredients.entries())visit(item,fraction,[...path,{kind:'recipe',id:source.recipeId,index}]);
    }else{
      for(const [index,item] of parsed.resource.items.entries())visit(item,source.amount,[...path,{kind:'meal',id:source.mealId,index}]);
    }
  };
  visit(row,1,[]);return rows;
}

// Shared row production for explicit expansion and automatic meal logging.
// Persistence supplies child IDs; the source quantity and lineage stay identical.
export function expandedDiarySources(state,original){
  const common=parseFoodDiaryFields({date:original.date,group:original.group??state.settings.groups[0],time:original.time??''},state.settings.groups),parent=parseReferencedQuantity(state,original).source;
  return expandResourceQuantity(state,original,{target:'children'}).map(({source,path})=>({
    ...source,...common,kind:'food',name:parseReferencedQuantity(state,source).resource.name,
    ...(original.photo?{photo:original.photo}:{}),
    ...(original.textReview?{textReview:{...original.textReview,modifiedAfterReview:true}}:{}),
    ...(original.copiedFrom?{copiedFrom:original.copiedFrom}:{}),
    expandedFrom:{version:1,id:original.id,date:common.date,parent,path,...(original.expandedFrom?{previous:original.expandedFrom}:{})},
    ...(original.repeatId!==undefined?{repeatId:original.repeatId}:{})
  }));
}
