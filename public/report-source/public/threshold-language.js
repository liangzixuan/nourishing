import {formatMessage} from './message-format.js';
export const thresholdMessage=(language,key,values)=>formatMessage(language,'threshold.'+key,values);
const bases=new Set(['preformed-retinol','total','synthetic-supplement-or-fortified','folic-acid-not-dfe','pharmacological-only-excluding-food-water']);
export const upperLimitBasisLabel=(basis,language='en')=>bases.has(basis)?thresholdMessage(language,'basis.'+basis):basis;
