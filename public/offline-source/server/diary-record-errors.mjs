export const diaryRecordErrors=Object.freeze({
 foodFields:'Supply only the food date, time and group.',
 timeField:'Supply a time, or an empty string to remove it.',
 time:'Use a valid HH:MM time.',
 group:'Choose an existing diary group.',
 optionalGroup:'Choose an existing diary group, or no group.'
});
export class DiaryRecordError extends Error{
 constructor(code){if(!Object.hasOwn(diaryRecordErrors,code))throw new RangeError('Unknown diary record error.');super(diaryRecordErrors[code]);this.status=400;this.diaryRecordCode=code;}
}
export function diaryRecordErrorFields(error){return error instanceof DiaryRecordError?{diaryRecordError:{code:error.diaryRecordCode}}:{};}
export function isDiaryRecordErrorCapture(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&Object.hasOwn(value,'code')&&typeof value.code==='string'&&Object.hasOwn(diaryRecordErrors,value.code);}
