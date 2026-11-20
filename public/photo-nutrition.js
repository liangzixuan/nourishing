import {uiLanguage,t} from './app-language.js';
import {fc} from './food-cloud-messages.js';
import {escape as e} from './html.js';
import {recipeNutrition} from './report-source/server/nutrition.mjs';
import {resolveFoodQuantity} from './report-source/server/food-quantity.mjs';
import {convertEnergy} from './report-source/server/energy-units.mjs';

/** A loaded food owns the measured basis; use the shared calculator for edits. */
export function previewPhotoFood(item, quantity) {
 const food=item.resource, measured=resolveFoodQuantity(food,quantity);
 const facts=recipeNutrition({settings:{},foods:[food]},{servings:1,ingredients:[{foodId:food.id,...quantity}]});
 const unit=item.energyUnit??'kcal', calories=facts.nutrients.calories;
 const grams=measured?.grams??(Number.isFinite(food.grams)?food.grams*(quantity.amount??1):null);
 return {nutrition:{totals:facts.nutrients,entries:[{grams}]},energy:{value:Number.isFinite(calories)?convertEnergy(calories,'kcal',unit):null,unit}};
}
const number=value=>Number.isFinite(value)?value.toLocaleString(uiLanguage(),{maximumFractionDigits:1}):'—';
const nutrients=['protein','carbs','fat'];
export function photoMacros(preview){
 if(!preview)return '';
 const totals=preview.nutrition.totals;
 return `${number(preview.energy.value)} ${e(preview.energy.unit)} · ${number(totals.protein)} g ${e(t('mobileNutrientTargets.group.protein'))} · ${number(totals.carbs)} g ${e(t('energyChart.component.carbohydrate'))} · ${number(totals.fat)} g ${e(t('mobileDiary.fat'))}`;
}
export function photoNutritionSummary(previews){
 if(!previews.length)return '';
 const sum=read=>previews.every(value=>value&&Number.isFinite(read(value)))?previews.reduce((total,value)=>total+read(value),0):null;
 const unit=previews.find(Boolean)?.energy.unit??'kcal',sameUnit=previews.every(value=>value?.energy.unit===unit);
 const energy=sameUnit?sum(value=>value.energy.value):null,values=nutrients.map(key=>sum(value=>value.nutrition.totals[key]));
 const shares=values.map((value,index)=>value===null?null:value*(index===2?9:4)),total=shares.every(Number.isFinite)?shares.reduce((a,b)=>a+b,0):0;
 let offset=0;
 const arcs=total>0?shares.map((value,index)=>{const length=value/total*100,arc=`<circle class="photo-macro-${nutrients[index]}" cx="60" cy="60" r="48" pathLength="100" stroke-dasharray="${length} ${100-length}" stroke-dashoffset="${-offset}"/>`;offset+=length;return arc;}).join(''):'';
 return `<summary>${e(t("mobileFood.energy"))}<span>${number(energy)} ${e(unit)}</span></summary><div class="photo-energy"><div class="photo-energy-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="photo-macro-empty" cx="60" cy="60" r="48"/>${arcs}</svg><span><strong>${number(energy)}</strong><small>${e(unit)}</small></span></div><dl>${nutrients.map((key,index)=>`<div><dt><i class="photo-macro-${key}"></i>${[t("mobileNutrientTargets.group.protein"),t("energyChart.component.carbohydrate"),t("mobileDiary.fat")][index]}</dt><dd>${number(values[index])} g</dd><dd class="photo-macro-percent">${number(total>0?shares[index]/total*100:null)}%</dd></div>`).join('')}</dl></div>`;
}
