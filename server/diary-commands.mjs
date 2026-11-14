import {act} from './domain/workspace.mjs';
export const invalid=message=>{throw Object.assign(Error(message),{code:400,publicMessage:message});};
const fields={
 'entry.add':['foodId','recipeId','mealId','date','time','group','amount','quantity','unit','portionId'],
 'entry.update':['id','date','time','group','amount','quantity','unit','portionId'],
 'entry.delete':['id'],
 'day.complete':['date','completed'],
 'note.add':['date','time','group','text'],
 'note.delete':['id']
};
export function validateAction(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['type','payload'].includes(k)))invalid('Invalid diary action.');
 const allowed=fields[input.type],p=input.payload;
 if(!allowed||!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!allowed.includes(k)))invalid('Invalid diary fields.');
 if(input.type==='entry.add'&&['foodId','recipeId','mealId'].filter(k=>typeof p[k]==='string'&&p[k].length>0).length!==1)invalid('Choose a food.');
 if(['entry.update','entry.delete','note.delete'].includes(input.type)&&(typeof p.id!=='string'||!p.id||p.id.length>1000))invalid('Choose a record.');
 return input;
}
export function parseCommand(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['requestId','revision','type','payload'].includes(k)))invalid('Invalid diary action.');
 if(typeof input.requestId!=='string'||typeof input.revision!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(input.requestId)||!/^[a-f0-9]{64}$/.test(input.revision))invalid('Refresh the diary and try again.');
 validateAction({type:input.type,payload:input.payload});return input;
}
export function applyDiaryCommand(state,input){
 validateAction(input);
 try{act(state,input.type,input.payload);}catch(error){if(error.status===400||error.status===409)throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}
}
