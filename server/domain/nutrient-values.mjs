import {catalog} from './nutrition.mjs';
import {number} from './diary-record-fields.mjs';
import {fail} from './workspace-validation.mjs';
export function nutrients(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)) fail('Nutrients must be an object.');
  const allowed=new Set(catalog.map(x=>x.id)); const result={};
  for(const [key,val] of Object.entries(value)) { if(!allowed.has(key)) fail(`Unknown nutrient: ${key}`); if(val===null||val==='') continue; result[key]=number(val,key); }
  return result;
}
