/** WOd/PTj/STj: public source score cards count food entries, not measured
 * nutrients, notes, exercise, or biometrics. Keep the formula value explicit
 * so a display-only zero never rewrites component calculations or intake. */
export function captureSourceScoreDisplay(formulaValue,foodEntryCount){
 return {value:foodEntryCount===0?0:Math.round(formulaValue),formulaValue,foodEntryCount,reason:foodEntryCount===0?'no-food-entries':'calculated'};
}
