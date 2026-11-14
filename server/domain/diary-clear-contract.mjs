export const clearAmountWarningCodes=Object.freeze(['retain-record-details','retain-unknown-coverage','leave-other-records']);
export function validClearAmountWarnings(value){
 return Array.isArray(value)&&value.length===clearAmountWarningCodes.length&&new Set(value).size===value.length&&value.every(code=>clearAmountWarningCodes.includes(code));
}
