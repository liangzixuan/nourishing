// Stable identities own generated energy guidance; English exports use this same catalog.
export const energyReasons=Object.freeze({
  "calendar-age": "Age uses completed calendar years on the viewed date. A February 29 birthday advances on March 1 in a non-leap year.",
  "before-birth": "The viewed date is before the birth date; age is unknown.",
  "age-outside-adult": "The selected age is outside the supported adult calculation, which starts at 19.",
  "exercise-unknown": "Some exercise entries have unknown energy.",
  "expenditure-unconfigured": "Energy expenditure has not been configured.",
  "recorded-weight": "The resting estimate uses the selected recorded weight for this date.",
  "recorded-height": "The resting estimate uses the selected recorded height for this date.",
  "recorded-height-missing": "The selected recorded height is unavailable; the saved manual height was not substituted.",
  "resting-outside-adult": "The resting estimate is unknown because the viewed date is outside the supported adult calculation.",
  "resting-body-unavailable": "The resting estimate is unknown because the selected recorded body inputs are unavailable or do not produce a positive estimate.",
  "resting-weight-unavailable": "The resting estimate is unknown because the selected recorded weight is unavailable or does not produce a positive estimate.",
  "resting-nonpositive": "These inputs do not produce a positive resting energy estimate for the viewed date.",
  "duration-missing": "Exercise duration is missing, so baseline activity cannot be adjusted.",
  "device-ambiguous": "More than one Health Connect daily total matches this date and zone.",
  "device-missing": "No known Health Connect daily total matches this date and zone.",
  "device-workouts": "Health Connect activity may include workouts; recorded exercise is not added.",
  "device-coverage": "The device query window does not establish continuous coverage.",
  "thermic-factors": "Thermic effect uses total carbohydrate and approximate 4/4/9/7 energy factors.",
  "thermic-unknown": "Thermic effect is unknown because one or more macro totals are missing, incomplete or negative.",
  "weight-goal-approximation": "The weight-goal energy adjustment uses a linear 3,500 kcal per pound approximation; it is not a recommended intake or a prediction of weight change.",
  "target-negative": "The calculated calorie target is negative; review the adjustment."
});
export const energyLimitations=Object.freeze({
  "consumed-allocation": "Macro calorie shares are estimates allocated per food using complete USDA source factors when available, otherwise general factors and the closer total/fiber-adjusted carbohydrate estimate. All four weights, including alcohol, are normalized to recorded calories before signed portion scaling. Negative components retain their values without percentages. Missing macros or incomplete published factors leave energy unattributed. Nutrient measurements are unchanged. This local calculation does not reproduce verified Cronometer server or alcohol normalization behavior.",
  "independent-means": "Each energy mean uses its own known dates. Remaining and balance use only dates with known intake and the corresponding target or expenditure; compare their day counts before comparing means.",
  "estimated-expenditure": "Expenditure is an estimate under the current energy policy. Device activity may include workouts; in device mode recorded exercise is shown separately and is not added again.",
  "device-and-filter-coverage": "Device query windows do not prove continuous device coverage. Missing expenditure stays unknown. Supplement filtering changes consumed energy, remaining and balance; it does not remove expenditure inputs or food used to estimate the thermic effect."
});
export const energyReportLimitationCodes=Object.freeze(Object.keys(energyLimitations));
export const isEnergyReason=code=>typeof code==='string'&&Object.hasOwn(energyReasons,code);
export const isEnergyLimitation=code=>typeof code==='string'&&Object.hasOwn(energyLimitations,code);
export function energyReasonText(code){if(!isEnergyReason(code))throw new TypeError('Unknown energy reason code.');return energyReasons[code];}
export function energyLimitationText(code){if(!isEnergyLimitation(code))throw new TypeError('Unknown energy limitation code.');return energyLimitations[code];}
