export const foodQualityGuidance=Object.freeze({
  "entry-weighting": "Source-derived availability averages ingredients within each recipe or meal, then gives each diary food entry equal weight. Amounts do not weight the result. A measured zero is available; missing data stays unmeasured.",
  "scope": "Data Quality uses visible source-registry nutrients, regardless of targets. Score confidence uses that score's captured component set with equal availability weights. Neither value measures dietary adequacy or food accuracy.",
  "exclusions": "Water logs, notes and exercise are excluded. Empty food contexts have zero availability. Excluded supplements do not contribute; mixed recipes retain their included ingredients.",
  "unresolved": "A nonzero unresolved ingredient uses the parent nutrient map. A zero unresolved ingredient stays in the denominator. Deep composites use their parent map at the source recursion boundary.",
  "provenance": "Local providers do not establish CRDB identity. Names and local supplement labels never activate CRDB missing-field credit. Parent maps use locally resolved measurements; original backend normalization and authenticated equivalence remain unverified.",
  "completeness": "Existing food-data completeness counts individual ingredient occurrences and remains a separate local measure."
});
export const captureFoodQualityGuidance=()=>Object.entries(foodQualityGuidance).map(([code,text])=>({code,text}));
export const isFoodQualityGuidance=note=>Boolean(note&&typeof note==='object'&&!Array.isArray(note)&&Object.keys(note).length===2&&Object.hasOwn(note,'code')&&Object.hasOwn(note,'text')&&typeof note.code==='string'&&note.code.length&&typeof note.text==='string'&&note.text.length);
