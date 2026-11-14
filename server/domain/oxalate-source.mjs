import Big from 'big.js';
import {isDeepStrictEqual} from 'node:util';
import dataset from './data/wake-oxalate-v1.json' with {type:'json'};

// Keep v1 pinned when adding a future dataset. Stored snapshots are assertions
// about these exact source bytes and rows, never a lookup against a moving list.
for(const row of dataset.rows)Object.freeze(row);
Object.freeze(dataset.rows);Object.freeze(dataset.source.limitations);Object.freeze(dataset.source);Object.freeze(dataset);
const eligible=dataset.rows.filter(row=>row.exclusion===null),byId=new Map(eligible.map(row=>[row.id,row]));
const Decimal=Big();Decimal.DP=340;
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const rowFacts=({id,page,rowOnPage,descriptionRaw,valueRaw,mgPer100g})=>({id,page,rowOnPage,descriptionRaw,valueRaw,mgPer100g});
const mass=value=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0.001||value>100000)fail('A sourced oxalate value requires a serving weight from 0.001 to 100,000 grams.');return value;};

export function searchOxalateSources(query=''){
  if(typeof query!=='string'||query.length>1000)fail('Search oxalate foods with text up to 1,000 characters.');
  const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean),rows=eligible.filter(row=>terms.every(term=>row.descriptionRaw.toLowerCase().includes(term))).map(rowFacts);
  return {source:structuredClone(dataset.source),rows,total:rows.length};
}

export function previewOxalateSource(input){
  if(!object(input)||Object.keys(input).length!==2||!Object.hasOwn(input,'rowId')||!Object.hasOwn(input,'grams'))fail('Choose only the oxalate source row and serving grams.');
  const row=typeof input.rowId==='string'?byId.get(input.rowId):null;
  if(!row)fail('Choose an eligible row from the pinned oxalate source.');
  const grams=mass(input.grams),mgPerServing=Number(new Decimal(row.valueRaw).times(grams).div(100).toString());
  if(!Number.isFinite(mgPerServing))fail('The sourced oxalate amount has no finite result.');
  return {oxalateSource:{version:1,source:structuredClone(dataset.source),row:rowFacts(row),grams,mgPerServing},mgPerServing};
}

/** Full food edits must submit their complete, still-consistent source assertion. */
export function parseFoodOxalateSource(food){
  if(!object(food))fail('Food oxalate provenance requires a food object.');
  if(!Object.hasOwn(food,'oxalateSource'))return {};
  if(food.readOnly===true)fail('Catalog source foods are read-only. Create a custom copy before assigning oxalate provenance.');
  const value=food.oxalateSource;
  if(!object(value)||!object(value.row))fail('The oxalate source snapshot is incomplete. Review and apply the source again.');
  const canonical=previewOxalateSource({rowId:value.row.id,grams:mass(food.grams)});
  if(!isDeepStrictEqual(value,canonical.oxalateSource)||food.nutrients?.oxalate!==canonical.mgPerServing)fail('The oxalate source snapshot, serving grams and nutrient amount must agree. Review and apply the source again.');
  return {oxalateSource:canonical.oxalateSource};
}
