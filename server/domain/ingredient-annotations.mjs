import {identifyUnit,unitsOfMeasure,parseIngredient} from 'parse-ingredient';
import {numericQuantity} from 'numeric-quantity';

/** Preserve complete parenthetical measurements before the ingredient library
 * removes parentheses. Same-length blanks retain original annotation offsets.
 * Scope is decided by the ingredient parser, not by this extraction boundary. */
export function separateIngredientMeasurements(original){
  const measurements=[],unresolvedMeasurements=[];
  const text=original.replace(/\([^()]*\)/gu,(group,start)=>{
    const content=group.slice(1,-1).trim();
    const total=content.match(/^(?:total\s+(.+)|(.+?)\s+total)$/iu);
    const measurementText=total?.[1]??total?.[2]??content;
    const numeric=numericQuantity(measurementText,{round:false,allowTrailingInvalid:true,verbose:true});
    const unit=identifyUnit((numeric.trailingInvalid??'').trim());
    if(!Number.isFinite(numeric.value)||numeric.value<=0||!['mass','volume'].includes(unitsOfMeasure[unit]?.type)){
      const parsed=parseIngredient(measurementText)[0];
      const parsedUnit=parsed?.unitOfMeasureID??identifyUnit(parsed?.description??'');
      if(parsed?.quantity!==null&&['mass','volume'].includes(unitsOfMeasure[parsedUnit]?.type))unresolvedMeasurements.push({start,end:start+group.length,text:group});
      return group;
    }
    measurements.push({start,end:start+group.length,text:group,quantity:numeric.value,unit,...(total?{scope:'total'}:{})});
    return ' '.repeat(group.length);
  });
  return {text,measurements,unresolvedMeasurements};
}

/** Prices are annotations, not food identities or ingredient measurements.
 * Only isolated parenthetical clauses with an explicit currency symbol qualify.
 * Offsets use JavaScript string indices into the unchanged source line. */
export function separateIngredientPrices(original){
  const annotations=[];
  const text=original.replace(/\([^()]*\)/gu,(group,offset)=>{
    const content=group.slice(1,-1);
    const price=/(?:^|[,;])(\s*[$£€¥]\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\**\s*)(?=$|[,;](?!\d))/gu;
    let cursor=0;const parts=[];
    for(const match of content.matchAll(price)){
      const raw=match[1],value=raw.trim(),start=offset+1+match.index+match[0].length-raw.length+raw.indexOf(value),end=start+value.length;
      annotations.push({kind:'price',start,end,text:original.slice(start,end)});
      const relative=start-offset-1;parts.push(content.slice(cursor,relative));cursor=end-offset-1;
    }
    if(!parts.length)return group;
    parts.push(content.slice(cursor));const remaining=parts.join(' ').replace(/[,;]\s*(?=[,;]|$)/gu,'').replace(/^\s*[,;]/u,'').trim();
    return remaining?'('+remaining+')':' ';
  });
  return {text,annotations};
}
