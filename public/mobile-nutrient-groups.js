import {nutrientDisplayName} from './report-source/public/nutrient-language.js';

import {sourceNutrients} from './report-source/server/source-nutrient-registry.mjs';
const sourceIds=new Set(sourceNutrients.map(row=>row.id));
export const isStandardMobileNutrient=id=>sourceIds.has(id);

// Order on the mobile Report and Nutrient Targets screens. Source identities,
// units, targets and visibility remain on the original rows.
export const mobileNutrientGroups = {
 general: ['calories','alcohol','caffeine','oxalate','phytate','water'],
 vitamins: ['thiamin','riboflavin','niacin','pantothenicAcid','vitaminB6','vitaminB12','folate','vitaminA','vitaminC','vitaminD','vitaminE','vitaminK'],
 minerals: ['calcium','copper','iron','magnesium','manganese','phosphorus','potassium','selenium','sodium','zinc'],
 carbohydrates: ['carbs','fiber','insolubleFiber','solubleFiber','starch','sugar','addedSugar'],
 lipids: ['fat','monounsaturatedFat','polyunsaturatedFat','omega3','ala','dha','epa','omega6','arachidonicAcid','linoleicAcid','saturatedFat','transFat','cholesterol'],
 protein: ['protein','cystine','histidine','isoleucine','leucine','lysine','methionine','phenylalanine','threonine','tryptophan','tyrosine','valine'],
};

const englishNames = {
 thiamin:'B1 (Thiamine)',riboflavin:'B2 (Riboflavin)',niacin:'B3 (Niacin)',pantothenicAcid:'B5 (Pantothenic Acid)',
 vitaminB6:'B6 (Pyridoxine)',vitaminB12:'B12 (Cobalamin)',folate:'Folate',vitaminA:'Vitamin A',vitaminE:'Vitamin E',
 carbs:'Carbs (Total)',insolubleFiber:'Fiber (Insoluble)',solubleFiber:'Fiber (Soluble)',sugar:'Sugars',addedSugar:'Added Sugars',
 fat:'Fat',monounsaturatedFat:'Fat (Monounsaturated)',polyunsaturatedFat:'Fat (Polyunsaturated)',
 ala:'Omega-3 (ALA)',dha:'Omega-3 (DHA)',epa:'Omega-3 (EPA)',arachidonicAcid:'Omega-6 (AA)',linoleicAcid:'Omega-6 (LA)',
 saturatedFat:'Fat (Saturated)',transFat:'Fat (Trans)',netCarbohydrate:'Net Carbs',
};
export function mobileNutrientName(row,language) {
 return (language==='en' && englishNames[row.id]) || nutrientDisplayName(row,language);
}
export function orderedNutrientRows(rowsById,group) {
 return mobileNutrientGroups[group].map(id=>rowsById.get(id)).filter(Boolean);
}
