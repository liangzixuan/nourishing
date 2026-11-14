const messages=Object.freeze({
 exampleQuantity:'Example quantity. Adjust it to the amount you will eat.',
 currentQuantity:'Current diary quantity. Review changes before saving.',
 coachExample:'Coach-generated example amount. Review the food identity, preparation, quantity and dietary suitability before saving.'
});
export function textReviewGuidance(code){if(!Object.hasOwn(messages,code))throw new RangeError('Unknown generated text-review guidance identity.');return{code,text:messages[code]};}
export function isTextReviewGuidance(value){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===2&&typeof value.code==='string'&&!!value.code.trim()&&value.code.length<=100&&typeof value.text==='string'&&!!value.text.trim()&&value.text.length<=500;}
/** Projection only; the observation owner validates captures before use. */
export const textGuidanceFields=row=>row&&Object.hasOwn(row,'guidance')?{guidance:structuredClone(row.guidance)}:{};
