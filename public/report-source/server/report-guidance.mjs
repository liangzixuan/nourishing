export const NUTRITION_REPORT_CAPTURE_VERSION=5;
export const PRINT_REPORT_CAPTURE_VERSION=3;
export const reportGuidance=Object.freeze({
 'nutrition.carbohydrate':'Calculated Total and Net reconcile source measurements per food and keep independent known-day denominators. Raw total nutrient rows retain source precedence; conflicting paths can leave calculated carbohydrate unknown.',
 'nutrition.unknown':'Unknown days are excluded from each nutrient mean. Zeros confirmed by completion are counted separately from measured food values.',
 'nutrition.partial':'Partial daily totals contain measured amounts only; their averages can be partial.',
 'nutrition.targets':'Target comparisons use the current workspace rules for the same known intake dates. These are not a record of targets configured when the entries were first logged.',
 'nutrition.supplements':'Supplement exclusion uses current reviewed food classifications. Unclassified items, inline values and missing sources remain included; historical classifications are not recorded.',
 'nutrition.contributions':'Contribution counts are logical food-leaf occurrences before quantity scaling. Filtered-empty days have no retained food leaves after excluding supplements, even when water, notes or exercise remain logged.',
 'nutrition.maximums':'Daily maximum counts compare each eligible date with its configured maximum under this supplement filter, not mean intake with a daily limit. Partial intake can exceed a maximum; within means complete measured coverage, not a safety assessment.',
 'nutrition.visibility':'Nutrient visibility and maxima are captured with this report. Hidden rows remain in the report data but are omitted from nutrient tables and CSV. Energy and macro views, diary details and selected charts are separate views.',
 'print.pressure':'Blood pressure pairing follows the displayed rules. Native source pairs retain the original measurement identity. Time/order matches do not establish that readings were taken together.',
 'print.glucose':'Glucose and blood ketone pairing follows the displayed rules. GKI is a calculated ratio, without treatment targets or medical classifications.',
 'print.biometrics':'Biometric details include all recorded metrics on eligible dates, including metrics outside the selected mappings.',
 'print.diaryScope':'Diary details include all logged food and activity rows on eligible dates. Supplement exclusion affects nutrition summaries and nutrient charts, not these diary rows.',
 'print.diaryValues':'Values use the diary calculation. Partial measurements remain partial; missing nutrient values remain unknown.',
 'print.exercise':'Exercise appears as negative energy in the Energy column and is not applicable to other nutrient columns. The macro summary labels energy burned separately.',
 'print.charts':'Selected charts use this report range and eligible dates, overriding their saved windows. Excluded and unknown days are gaps.',
 'print.cycle':'Cycle overlays show supplied phases on eligible past dates only. Each source has a separate row; missing phases are not inferred.'
});
export const nutritionReportGuidanceCodes=Object.freeze(['nutrition.carbohydrate','nutrition.unknown','nutrition.partial','nutrition.targets','nutrition.supplements','nutrition.contributions','nutrition.maximums','nutrition.visibility']);
export const captureReportGuidance=(codes=nutritionReportGuidanceCodes)=>codes.map(code=>{if(!Object.hasOwn(reportGuidance,code))throw new TypeError('Unknown report guidance identity.');return {code,text:reportGuidance[code]};});
export const isReportGuidance=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===2&&Object.hasOwn(value,'code')&&Object.hasOwn(value,'text')&&typeof value.code==='string'&&value.code.length>0&&typeof value.text==='string'&&value.text.length>0;
