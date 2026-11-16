import {escape as e} from './html.js';
const number=value=>Number.isFinite(value)?value.toLocaleString(undefined,{maximumFractionDigits:1}):'—';
const nutrients=['protein','carbs','fat'];
export function photoMacros(preview){
 if(!preview)return '';
 const totals=preview.nutrition.totals;
 return `${number(preview.energy.value)} ${e(preview.energy.unit)} · ${number(totals.protein)} g Protein · ${number(totals.carbs)} g Carbs · ${number(totals.fat)} g Fat`;
}
export function photoNutritionSummary(previews){
 if(!previews.length)return '';
 const sum=read=>previews.every(value=>value&&Number.isFinite(read(value)))?previews.reduce((total,value)=>total+read(value),0):null;
 const unit=previews.find(Boolean)?.energy.unit??'kcal',sameUnit=previews.every(value=>value?.energy.unit===unit);
 const energy=sameUnit?sum(value=>value.energy.value):null,values=nutrients.map(key=>sum(value=>value.nutrition.totals[key]));
 const shares=values.map((value,index)=>value===null?null:value*(index===2?9:4)),total=shares.every(Number.isFinite)?shares.reduce((a,b)=>a+b,0):0;
 let offset=0;
 const arcs=total>0?shares.map((value,index)=>{const length=value/total*100,arc=`<circle class="photo-macro-${nutrients[index]}" cx="60" cy="60" r="48" pathLength="100" stroke-dasharray="${length} ${100-length}" stroke-dashoffset="${-offset}"/>`;offset+=length;return arc;}).join(''):'';
 return `<summary>Energy Summary<span>${number(energy)} ${e(unit)}</span></summary><div class="photo-energy"><div class="photo-energy-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="photo-macro-empty" cx="60" cy="60" r="48"/>${arcs}</svg><span><strong>${number(energy)}</strong><small>${e(unit)}</small></span></div><dl>${nutrients.map((key,index)=>`<div><dt><i class="photo-macro-${key}"></i>${['Protein','Carbs','Fat'][index]}</dt><dd>${number(values[index])} g</dd></div>`).join('')}</dl></div>`;
}
