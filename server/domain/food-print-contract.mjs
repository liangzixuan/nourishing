import {catalog} from './nutrient-catalog.mjs';
const invalid=()=>{throw Object.assign(Error('The food print capture is incomplete. Generate a fresh preview.'),{status:400});};
const object=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))invalid();};
const text=(value,max,{empty=false}={})=>{if(typeof value!=='string'||value.length>max||(!empty&&!value.trim()))invalid();};
export function parseFoodPrintRequest(input){object(input,['id','includeNotes']);text(input.id,1000);if(typeof input.includeNotes!=='boolean')invalid();return {id:input.id,includeNotes:input.includeNotes};}
export function validateFoodPrintCapture(dto){
 object(dto,['version','request','capturedAt','food','nutrients','dataQuality','attributions']);if(dto.version!==2)invalid();parseFoodPrintRequest(dto.request);
 if(typeof dto.capturedAt!=='string'||!Number.isFinite(Date.parse(dto.capturedAt))||new Date(dto.capturedAt).toISOString()!==dto.capturedAt)invalid();
 object(dto.food,['name','serving','grams','barcode',...(Object.hasOwn(dto.food,'milliliters')?['milliliters']:[]),...(dto.request.includeNotes?['notes']:[])]);text(dto.food.name,500);text(dto.food.serving,100);text(dto.food.barcode,100,{empty:true});if(dto.food.grams!==null&&(typeof dto.food.grams!=='number'||!Number.isFinite(dto.food.grams)||dto.food.grams<=0||dto.food.grams>100000))invalid();
 if(Object.hasOwn(dto.food,'milliliters')&&(typeof dto.food.milliliters!=='number'||!Number.isFinite(dto.food.milliliters)||dto.food.milliliters<0.000001||dto.food.milliliters>100000))invalid();
 if(dto.request.includeNotes)text(dto.food.notes,4000,{empty:true});text(dto.dataQuality,4000,{empty:true});
 if(!Array.isArray(dto.attributions)||new Set(dto.attributions).size!==dto.attributions.length)invalid();
 for(const credit of dto.attributions)text(credit,32768);
 if(!Array.isArray(dto.nutrients)||dto.nutrients.length!==catalog.length)invalid();
 for(const [index,row]of dto.nutrients.entries()){object(row,['id','name','category','unit','value']);const definition=catalog[index];for(const key of ['id','name','category','unit'])if(row[key]!==definition[key])invalid();if(row.value!==null&&(typeof row.value!=='number'||!Number.isFinite(row.value)||row.value<0||row.value>10000000))invalid();}
 return dto;
}
