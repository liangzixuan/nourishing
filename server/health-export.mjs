import {createHmac,timingSafeEqual} from 'node:crypto';
import {healthBiometricExportOptions,projectHealthBiometricExport} from './domain/health-biometric-export.mjs';
import {healthIntakeExportOptions,parseHealthIntakeSelection,projectIntakeRecords} from './domain/health-intake-export.mjs';
import {assertPlainIntakePolicies} from './domain/health-intake-policies.mjs';
import {parseReportTimeZone} from './domain/calendar.mjs';
import {readHealthExportState} from './health-export-state.mjs';

export const HEALTH_EXPORT_RESPONSE_BYTES=1_048_576;
const fail=(message,code=400)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
function bounded(value){
 if(Buffer.byteLength(JSON.stringify(value))>HEALTH_EXPORT_RESPONSE_BYTES)fail('This export exceeds the Android response limit. Select a smaller date range.',413);
 return value;
}
function verification(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||!Object.hasOwn(input,'selection')||!Object.hasOwn(input,'reviewToken')||typeof input.reviewToken!=='string'||!/^[a-f0-9]{64}$/.test(input.reviewToken))fail('Supply the selection and its review token.');
 return input;
}
/** Pure source projections wrapped by the current authenticated account owner.
 * No read creates identity, drafts, receipts, or write authority. */
export function createHealthExport({readState,ownerId,reviewSecret,timeZone='UTC'}){
 if(typeof readState!=='function'||typeof ownerId!=='string'||!ownerId||ownerId.length>100||typeof reviewSecret!=='string'||reviewSecret.length<32)fail('Health Connect export is not configured.',503);
 parseReportTimeZone(timeZone);
 const operation=fn=>async(...args)=>{try{return bounded(await fn(...args));}catch(error){if(Number.isInteger(error.status))fail(error.message,error.status);throw error;}};
 async function current(){
  const state=await readState(),identity=readHealthExportState(state);
  if(!identity)fail('Health Connect export identity has not been migrated for this account.',409);
  return {state,identity};
 }
 function token(kind,identity,facts){
  return createHmac('sha256',reviewSecret).update(JSON.stringify(['health-export',kind,ownerId,identity.namespace,identity.saveScope,facts])).digest('hex');
 }
 function provider(kind){
  const options=operation(async()=>{
   const {state,identity}=await current();
   return {...(kind==='biometric'?healthBiometricExportOptions(state,timeZone):healthIntakeExportOptions(timeZone)),namespace:identity.namespace,accountId:ownerId};
  });
  const preview=operation(async input=>{
   const {state,identity}=await current();let facts;
   if(kind==='biometric'){
    const {reviewToken:sourceToken,...projected}=projectHealthBiometricExport(state,input,identity.namespace);facts=projected;
   }else{
    const selection=parseHealthIntakeSelection(input);
    assertPlainIntakePolicies(identity.policies,state,selection,identity.namespace);
    facts={version:2,selection,...projectIntakeRecords(state,selection,identity.namespace)};
   }
   return {...facts,reviewToken:token(kind,identity,facts),namespace:identity.namespace,accountId:ownerId};
  });
  const verify=operation(async input=>{
   verification(input);const reviewed=await preview(input.selection);
   if(!timingSafeEqual(Buffer.from(input.reviewToken,'hex'),Buffer.from(reviewed.reviewToken,'hex')))fail('Records or export identity changed. Preview again before writing to Health Connect.',409);
   return {valid:true,reviewToken:reviewed.reviewToken};
  });
  return {options,preview,verify};
 }
 return {biometric:provider('biometric'),intake:provider('intake')};
}
