import {photoPortionEvidence} from './photo-portion-estimate.mjs';
import {isQuantityUnit} from './quantity-units.mjs';
const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function exactFields(value,required,optional=[]){if(!object(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>![...required,...optional].includes(key)))invalid('Reviewed food metadata contains missing or unsupported fields.');}
function reviewedText(value,name,limit,{trim=true}={}){if(typeof value!=='string'||!value.trim()||value.length>limit)invalid(`${name} must contain 1 to ${limit} characters.`);return trim?value.trim():value;}

/** Canonical confirmed source rows, without preview candidates or conversions. */
export function reviewedFoodRows(value){
  if(!Array.isArray(value)||value.length<1||value.length>30)invalid('Food review metadata needs 1 to 30 reviewed foods.');
  const ids=new Set();return value.map(row=>{
    exactFields(row,['id','description','preparation','selection','quantity','unit','confirmed'],['portionId','portionEstimate']);
    const id=reviewedText(row.id,'Reviewed food row ID',100);if(ids.has(id))invalid('Reviewed food row IDs must be unique.');ids.add(id);
    const description=reviewedText(row.description,'Reviewed food description',500);
    if(typeof row.preparation!=='string'||row.preparation.length>100)invalid('Food preparation must be text up to 100 characters.');
    exactFields(row.selection,['kind','id']);if(!['catalog','library'].includes(row.selection.kind))invalid('Choose a catalog or saved food.');
    const selection={kind:row.selection.kind,id:reviewedText(row.selection.id,'Selected food ID',200,{trim:false})};
    if(!(isQuantityUnit(row.unit)||['portion','servings'].includes(row.unit))||row.confirmed!==true)invalid('Retained foods require a confirmed supported quantity.');
    if(typeof row.quantity!=='number'||!Number.isFinite(row.quantity)||row.quantity<=0||row.quantity>(row.unit==='servings'?100000:1000000))invalid('Retained food quantity is outside its supported range.');
    if(row.unit!=='portion'&&Object.hasOwn(row,'portionId'))invalid('Only a recorded portion may retain a portion ID.');
    const portion=row.unit==='portion'?{portionId:reviewedText(row.portionId,'Source portion ID',200,{trim:false})}:{};
    return {id,description,preparation:row.preparation,selection,quantity:row.quantity,unit:row.unit,...portion,confirmed:true,...photoPortionEvidence(row)};
  });
}
