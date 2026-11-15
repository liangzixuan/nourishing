import {act} from './domain/workspace.mjs';
const invalid=()=>{throw Object.assign(Error('Choose 1 to 30 foods with valid amounts.'),{code:400,publicMessage:'Choose 1 to 30 foods with valid amounts.'});};
export function validateMealLog(payload){
 if(!Array.isArray(payload.rows)||payload.rows.length<1||payload.rows.length>30)invalid();
 for(const row of payload.rows){
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(key=>!['foodId','amount','quantity','unit','portionId'].includes(key))||typeof row.foodId!=='string'||!row.foodId||row.foodId.length>1000)invalid();
  const amount=row.quantity??row.amount;if(typeof amount!=='number'||!Number.isFinite(amount)||amount<=0||row.quantity!==undefined&&row.amount!==undefined)invalid();
 }
}
export function applyMealLog(state,payload){
 validateMealLog(payload);const candidate=structuredClone(state),entryIds=[];
 for(const row of payload.rows){const count=candidate.entries.length;act(candidate,'entry.add',{...row,date:payload.date,time:payload.time,group:payload.group});entryIds.push(...candidate.entries.slice(count).map(r=>r.id));}
 Object.assign(state,candidate);return {entryIds};
}
