// Independent meal examples, not Cronometer's proprietary meal corpus.
// Quantities describe one editable example serving, not a portion recommendation.
const archiveSha256='b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0';
const foods={
  rice:[168930,'Rice, white, medium-grain, cooked, unenriched'],
  chicken:[171477,'Chicken, broilers or fryers, breast, meat only, cooked, roasted'],
  bokChoy:[170391,'Cabbage, chinese (pak-choi), cooked, boiled, drained, without salt'],
  oil:[171413,'Oil, olive, salad or cooking'],
  tofu:[172475,'Tofu, raw, firm, prepared with calcium sulfate'],
  broccoli:[169967,'Broccoli, cooked, boiled, drained, without salt'],
  beans:[173735,'Beans, black, mature seeds, cooked, boiled, without salt'],
  avocado:[171705,'Avocados, raw, all commercial varieties'],
  salmon:[173692,'Fish, salmon, sockeye, cooked, dry heat'],
  potato:[170438,'Potatoes, boiled, cooked in skin, flesh, without salt'],
  egg:[173424,'Egg, whole, cooked, hard-boiled'],
  spinach:[168463,'Spinach, cooked, boiled, drained, without salt'],
  oats:[173905,'Cereals, oats, regular and quick, unenriched, cooked with water (includes boiling and microwaving), without salt'],
  banana:[173944,'Bananas, raw'],
  peanuts:[172470,'Peanut butter, smooth style, without salt'],
  yogurt:[170903,'Yogurt, Greek, plain, lowfat'],
  blueberries:[171711,'Blueberries, raw'],
  almonds:[170567,'Nuts, almonds'],
  chickpeas:[173757,'Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt'],
};
const vegan=['vegan','vegetarian','pescatarian'],vegetarian=['vegetarian','pescatarian'];
const veganGlutenFree=[...vegan,'gluten-free'],vegetarianGlutenFree=[...vegetarian,'gluten-free'];
const meal=(id,name,categories,diets,exclusions,ingredients)=>Object.freeze({
  ref:Object.freeze({kind:'template',id}),name,
  tags:Object.freeze({categories:Object.freeze(categories),diets:Object.freeze(diets),exclusions:Object.freeze(exclusions)}),
  source:Object.freeze({kind:'independent-local-template',version:2,tagBasis:'Curated from explicitly listed ingredient identities; no package, cross-contact or unlisted ingredient assessment.',...(diets.includes('gluten-free')?{glutenFreeBasis:'Plain listed ingredients, not tested products or gluten-free certification.',tagReference:'https://www.niddk.nih.gov/health-information/digestive-diseases/celiac-disease/eating-diet-nutrition'}:{})}),
  ingredients:Object.freeze(ingredients.map(([key,quantity])=>Object.freeze({ref:Object.freeze({kind:'catalog',id:'usda:sr-legacy-2018-04:'+foods[key][0]}),name:foods[key][1],archiveSha256,quantity,unit:'g'}))),
});
export const MEAL_LIBRARY=Object.freeze([
  meal('chicken-rice-bok-choy','Chicken, rice and bok choy',['lunch','dinner'],['gluten-free'],[],[['chicken',120],['rice',150],['bokChoy',150],['oil',5]]),
  meal('tofu-rice-broccoli','Tofu, rice and broccoli',['lunch','dinner'],vegan,['soy'],[['tofu',120],['rice',150],['broccoli',150],['oil',5]]),
  meal('beans-rice-avocado','Black beans, rice and avocado',['lunch','dinner'],veganGlutenFree,[],[['beans',150],['rice',120],['avocado',60]]),
  meal('salmon-potato-broccoli','Salmon, potato and broccoli',['lunch','dinner'],['pescatarian','gluten-free'],['fish'],[['salmon',120],['potato',180],['broccoli',150],['oil',5]]),
  meal('eggs-potato-spinach','Eggs, potato and spinach',['breakfast','lunch'],vegetarianGlutenFree,['egg'],[['egg',100],['potato',150],['spinach',100],['oil',5]]),
  meal('banana-peanut-oats','Banana and peanut oatmeal',['breakfast'],vegan,['peanut'],[['oats',200],['banana',100],['peanuts',16]]),
  meal('yogurt-berries-almonds','Yogurt, blueberries and almonds',['breakfast','dessert','snack'],vegetarian,['milk','tree-nut'],[['yogurt',170],['blueberries',100],['almonds',20]]),
  meal('chickpea-spinach-rice','Chickpeas, spinach and rice',['lunch','dinner'],veganGlutenFree,[],[['chickpeas',150],['spinach',100],['rice',120],['oil',5]]),
  meal('banana-almonds','Banana and almonds',['dessert','snack'],veganGlutenFree,['tree-nut'],[['banana',120],['almonds',25]]),
  meal('egg-avocado','Egg and avocado',['breakfast','snack'],vegetarianGlutenFree,['egg'],[['egg',100],['avocado',70]]),
]);
