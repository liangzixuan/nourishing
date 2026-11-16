import {formatMessage} from './message-format.js';
import {biometricInputValue} from './biometric-value.js';
/** Compound entry changes presentation only; one decimal-stone value is reviewed. */
export const usesCompoundWeight=(metric,unit,custom=false)=>!custom&&metric?.selection.kind==='catalog'&&metric.selection.id==='weight'&&unit.trim()==='st';
export function stoneWeightValue(stones,pounds,language='en'){
 const message=(key,values)=>formatMessage(language,'measurementLog.'+key,values);
 const read=(value,label)=>{
  const number=typeof value==='string'&&!value.trim()?0:biometricInputValue(value,label,language);
  if(number<0)throw Error(message('nonnegative',{label}));
  return number;
 };
 const value=read(stones,message('stones'))+read(pounds,message('pounds'))/14;
 if(value<=0)throw Error(message('weightPositive'));
 if(value>1000000)throw Error(message('weightLimit'));
 return value;
}
