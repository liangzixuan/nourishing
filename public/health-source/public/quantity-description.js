import {formatMessage} from './../../report-source/public/message-format.js';
import {isQuantityUnit} from './../../report-source/server/quantity-units.mjs';
export function quantityDescription(quantity,language='en'){
 const invalid=()=>{throw Error(formatMessage(language,'quantity.invalidPreview'));};
 if(!quantity||typeof quantity!=='object'||!Number.isFinite(quantity.value))return invalid();
 const value=quantity.value.toLocaleString(language,{maximumFractionDigits:20});
 switch(quantity.kind){
  case 'servings':return formatMessage(language,'libraryView.servings',{count:quantity.value,amount:value});
  case 'batch':return value+' × '+formatMessage(language,'quantity.fullRecipe');
  case 'portion':if(typeof quantity.label!=='string')return invalid();return value+' × '+quantity.label;
  case 'measurement':if(!isQuantityUnit(quantity.unit))return invalid();return value+' '+quantity.unit;
  default:return invalid();
 }
}
