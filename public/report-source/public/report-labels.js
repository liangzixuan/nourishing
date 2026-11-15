import {formatMessage} from './message-format.js';
export const reportMessage=(language,key,values)=>formatMessage(language,'nutritionReport.'+key,values);
export const reportNumber=(value,language='en')=>value===null||value===undefined?reportMessage(language,'unknown'):Number(value).toLocaleString(language,{maximumFractionDigits:4});
const reasons=new Set(['no-known-intake','missing-target','zero-target']);
export const reportReason=(code,language='en')=>code===null||code===undefined?'':reasons.has(code)?reportMessage(language,'reason.'+code):code;
