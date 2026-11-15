import {createHmac,timingSafeEqual} from 'node:crypto';
import {importCsv} from './domain/importers.mjs';
import {digest} from './data-codec.mjs';

// JSON can encode one source character as six bytes (for example, a tab).
export const CSV_BODY_BYTES=60_010_000;
const lifetime=30*60*1000;
const fail=(message,code=400)=>{throw Object.assign(Error(message),{code,status:code,publicMessage:message});};
export function validateCsvInput(input,{saving=false}={}){
 const keys=saving?['kind','text','revision','reviewToken','requestId']:['kind','text'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==keys.length||keys.some(key=>!Object.hasOwn(input,key)))fail('Choose a CSV file and import type.');
 if(!['foods','biometrics','diary'].includes(input.kind))fail('Choose Foods, Biometrics or Diary.');
 if(typeof input.text!=='string'||input.text.length>10_000_000||!input.text.trim())fail('Choose a CSV file below 10 MB.');
 if(saving&&(!/^[a-f0-9]{64}$/.test(input.revision??'')||typeof input.reviewToken!=='string'||input.reviewToken.length>2048||typeof input.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.requestId)))fail('Preview this CSV file again.');
 return input;
}
export function prepareCsvImport(state,input){
 const candidate=structuredClone(state);
 let count;try{count=importCsv(candidate,input.text,input.kind);}catch(error){if(error.status===400)fail(error.message);throw error;}
 if(!count)fail('The CSV has no records.');
 return {state:candidate,count};
}
function mac(value,secret){
 if(typeof secret!=='string'||secret.length<32)fail('CSV imports are unavailable.',503);
 return createHmac('sha256',secret).update('nourishing:csv-review:v1\0'+value).digest();
}
export function csvReview(input,{owner,revision,count,reviewSecret,now=Date.now()}){
 const encoded=Buffer.from(JSON.stringify({owner,revision,count,kind:input.kind,source:digest(input.text),issued:now,expires:now+lifetime})).toString('base64url');
 return encoded+'.'+mac(encoded,reviewSecret).toString('base64url');
}
export function verifyCsvReview(input,{owner,reviewSecret,now=Date.now()}){
 const expired=()=>fail('Preview this CSV file again.',409);
 if(!/^[-\w]+\.[-\w]{43}$/.test(input.reviewToken))expired();
 const [encoded,signature]=input.reviewToken.split('.'),expected=mac(encoded,reviewSecret),received=Buffer.from(signature,'base64url');
 if(received.length!==expected.length||!timingSafeEqual(expected,received))expired();
 let review;try{review=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));}catch{expired();}
 if(review.owner!==owner||review.revision!==input.revision||review.kind!==input.kind||review.source!==digest(input.text)||!Number.isFinite(review.issued)||review.issued>now||review.expires!==review.issued+lifetime||review.expires<=now||!Number.isSafeInteger(review.count)||review.count<1)expired();
 return review;
}
