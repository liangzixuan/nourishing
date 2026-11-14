export const ingredientWarningCodes=Object.freeze(["unresolved-measurement", "unparsed-range", "conflicting-measurements", "measurement-scope", "missing-quantity", "ambiguous-number-format", "quantity-range", "approximate-quantity", "to-taste", "optional-ingredient", "unmeasured-extra", "compound-quantity", "quantity-qualifier", "package-quantity", "ingredient-part", "trailing-fraction", "missing-description", "structured-name-heading", "structured-quantity", "structured-range", "structured-unit-text", "structured-unit-code", "structured-unit-conflict", "structured-description", "multiline-source", "entered-quantity", "alternative-choice"]);
const codes=new Set(ingredientWarningCodes),variants=new Set(['unresolved','complete','limited']);
export const ingredientWarning=(code,values={})=>({kind:'ingredient',code,values});
export function isIngredientWarning(value){
 if(!value||value.kind!=='ingredient'||!codes.has(value.code)||!value.values||typeof value.values!=='object'||Array.isArray(value.values))return false;
 const keys=Object.keys(value.values);
 return value.code==='alternative-choice'?keys.length===1&&keys[0]==='variant'&&variants.has(value.values.variant):keys.length===0;
}
