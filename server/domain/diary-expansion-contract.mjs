export const DIARY_EXPANSION_VERSION=1;
export const diaryExpansionWarningCodes=Object.freeze(['replacement','retained','photo','repeat','copy']);
export function isDiaryExpansionWarningCodes(value){
 return Array.isArray(value)&&value.length>=2&&new Set(value).size===value.length&&value[0]==='replacement'&&value[1]==='retained'&&value.every(code=>diaryExpansionWarningCodes.includes(code));
}
