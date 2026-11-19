export const scoreLimitations=Object.freeze({
 'calcium.precision':'Food source rows use diary display precision; the calculation uses unrounded group inputs.',
 'calcium.separate':'The separate manual-equation absorbed-calcium estimate uses a different coefficient and availability rule. These two outputs are not interchangeable.',
 'method.public':'Weights and component rules are derived from public web source. Target inputs come from this workspace; authenticated and mobile equivalence are unverified.',
 'method.local':'This is local target progress based on your configured nutrient targets.',
 'components.overall':'Each source-available identity with a visible positive effective target has equal weight. Total and Net are separate. Hidden and unavailable targets are excluded; missing measured intake keeps its weight and contributes zero. No maximum penalty applies.',
 'components.keto':'The fixed denominator is 16: fat has weight 10, Net carbohydrate 0 and each other component 1. Missing or disabled components contribute zero credit without being labeled measured. Partial recorded totals can contribute and may understate maximum penalties.',
 'components.oral':'The six component weights stay in the denominator. Ordinary target credit becomes 90% above both target and maximum. Sugar credit is max(0, 1 - recorded sugar / maximum). The default score reference is 100 g, used only without a custom sugar target or maximum.',
 'components.progress':'All component weights stay in the denominator. Missing intake contributes zero credit; ordinary progress becomes 90% above both target and maximum. Ordinary protein inputs use rounded dynamic macro targets and a rounded 110% maximum, or fixed target/maxima. Plant then applies its captured reference rules; explicit maxima override ordinary defaults.',
 'components.local':'Maximum penalties and nutrient-balance components are not implemented.',
 'coverage.overall':'The effective local target map is used once, with its existing reference, weekday, template, energy and macro precedence. Dynamic targets are not rounded again and target-bar side effects are not simulated. Local water uses mL and hydration entries; source water uses grams, so normalization equivalence is unverified.',
 'coverage.oral':'Unmeasured intake is substituted with zero only for calculation. This can award sugar-limit credit on an unlogged day; coverage and measured values remain unknown.',
 'coverage.keto':'An empty or unmeasured day has zero weighted credit. Its coverage remains unmeasured; zero does not establish diet quality or ketosis.',
 'coverage.progress':'Unmeasured intake contributes zero only in the calculation. Missing values and measurement coverage remain unknown.',
 'coverage.local':'Measured partial intake can contribute; missing measurements are excluded. An empty completed day does not create measured score components.',
 'precision.components':'Components use unrounded daily intake and effective targets. Food-source rows use diary display precision and may not sum to the raw component total.',
 'rounding.keto':'Keto subtracts the unrounded carbohydrate penalty before rounding the final score to a whole number. Component points retain their calculation precision.',
 'rounding.aggregate':'The aggregate rounds mean component progress. Separately scaled point totals can differ at a floating-point rounding boundary.',
 'sources.entries':'Recipes and meals count as logged food entries with ingredients included; sources are not flattened into ingredient rankings.'
});
const note=(code,text=scoreLimitations[code])=>({code,text});
export function captureScoreLimitations(definition){
 if(definition.id==='dataQuality')throw new TypeError('Data Quality owns its limitations in its availability capture.');
 if(definition.id==='calciumAbsorption')return [note('method',definition.description),note('calcium.precision'),note('calcium.separate')];
 const family=['overall','keto','oral'].includes(definition.id)?definition.id:['public-web-progress-v1','public-web-antioxidant-v1','public-web-plant-v1'].includes(definition.method)?'progress':'local';
 return [
  ...(definition.selectionNote?[note('selection.'+definition.id,definition.selectionNote)]:[]),
  ...(definition.calculationNote?[note('calculation.'+definition.id,definition.calculationNote)]:[]),
  note(definition.method.startsWith('public-web-')?'method.public':'method.local'),
  note('components.'+family),note('coverage.'+family),note('precision.components'),
  note(definition.id==='keto'?'rounding.keto':'rounding.aggregate'),note('sources.entries')
 ];
}
export const isScoreLimitation=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===2&&Object.hasOwn(value,'code')&&Object.hasOwn(value,'text')&&typeof value.code==='string'&&value.code.length>0&&typeof value.text==='string'&&value.text.length>0;
