import {text} from './diary-record-fields.mjs';
export const fail = message => { throw Object.assign(new Error(message), {status:400}); };
export const maxRecordCollectionRows=100000;
export const array = (value,name,max=maxRecordCollectionRows) => { if(!Array.isArray(value)||value.length>max) fail(`${name} must be an array of at most ${max} items.`); return value; };
export function exactId(value,name='Record ID',max=1000){text(value,name,max);return value;}
export function objectKeys(value,keys,name){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))fail(`${name} contains invalid fields.`);
}
