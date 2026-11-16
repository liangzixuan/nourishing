import {formatMessage} from './message-format.js';
// Text-entry grammar only. Existing numeric record owners enforce metric ranges.
const decimal=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
export function biometricInputValue(input,label='Value',language='en'){
 const message=key=>formatMessage(language,'biometricInput.'+key,{label});
 if(typeof input!=='string'||!input.trim())throw Error(message('required'));
 const parts=input.trim().split('/');
 if(parts.length>2||parts.some(part=>!decimal.test(part.trim())))throw Error(message('number'));
 const values=parts.map(part=>Number(part.trim()));
 if(values.some(value=>!Number.isFinite(value)))throw Error(message('finite'));
 if(values.length===2&&values[1]===0)throw Error(message('denominator'));
 const value=values.length===2?values[0]/values[1]:values[0];
 if(!Number.isFinite(value))throw Error(message('finite'));
 return value;
}
