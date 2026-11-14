/** The saved definition supplies identity/name. A diary occurrence can own its
 * ingredient quantities without changing that definition or other occurrences. */
export function mealForEntry(meal,entry){
 return meal&&entry.mealItems!==undefined?{...meal,items:entry.mealItems}:meal;
}
