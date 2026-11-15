export const mealSuggestionGuidance=Object.freeze({
  "independent": "Ten independent meal examples use explicit pinned USDA ingredients. This is not Cronometer meal data or ranking.",
  "quantities": "Example quantities are editable. Added sauces, seasonings and preparation changes must be entered separately.",
  "tags": "Diet and exclusion tags cover the listed ingredients only. They do not establish package, cross-contact or allergy suitability.",
  "unknownTags": "Unknown tags are excluded when filters apply unless you explicitly include them. Changed saved ingredients invalidate reviewed tags.",
  "preferences": "Show less places that item after other eligible suggestions. Remove once applies only to the current result session. Always exclude stays saved until you restore the suggestion.",
  "pinnedIngredients": "The exact pinned USDA ingredients are not installed."
});
export function captureMealSuggestionGuidance(code){if(!Object.hasOwn(mealSuggestionGuidance,code))throw new TypeError('Unknown meal guidance identity.');return {code,text:mealSuggestionGuidance[code]};}
