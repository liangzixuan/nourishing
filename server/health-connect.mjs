import {randomBytes,timingSafeEqual} from 'node:crypto';
import {digest} from './data-codec.mjs';
import {prepareHealthImport,importHealth} from './domain/health-connect.mjs';

// Matches the Android export writer. HTTP must enforce this before JSON parsing.
export const HEALTH_EXPORT_MAX_BYTES=20_000_000;
export const healthCommandFields={'health.import':['export','reviewToken']};
const fail=(message,code=400)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const token=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const sameToken=(left,right)=>token(left)&&token(right)&&timingSafeEqual(Buffer.from(left,'hex'),Buffer.from(right,'hex'));
function account(ownerId){if(typeof ownerId!=='string'||!ownerId||ownerId.length>36)fail('Sign in to import health data.',401);return ownerId;}
function source(operation){try{return operation();}catch(error){if([400,404,409].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}}

export function validateHealthExport(input){
 if(!isRecord(input)||Object.keys(input).some(key=>!['format','version','exportedAt','range','records'].includes(key)))fail('Choose a Health Connect export.');
 if(!isRecord(input.range)||Object.keys(input.range).some(key=>!['from','to','zone'].includes(key)))fail('Invalid Health Connect range.');
 // The source domain owns measurement, provenance, grouping and update validation.
 if(Buffer.byteLength(JSON.stringify(input),'utf8')>HEALTH_EXPORT_MAX_BYTES)fail('Select fewer dates or data types and export again.',413);
 return input;
}

export function healthWarningText(warning){
 switch(warning.code){
  case 'snapshot-scope':return 'Imports add or update records. Missing records are not deleted.';
  case 'reconciliation-scope':return 'Changes apply to the reviewed sync scope.';
  case 'sleep-energy':return 'Sleep can include awake time; missing stages stay unknown. Active calories follow your saved energy settings.';
  case 'no-group':return 'New records have no diary group.';
  case 'group':return `New records use ${warning.group}.`;
  case 'older':return `${warning.count} older records kept unchanged.`;
  case 'protected':return `${warning.count} records protected by prior sync changes.`;
  case 'outside':return `${warning.count} records fall outside the selected dates.`;
  case 'aggregate':return 'Daily totals use Health Connect aggregates.';
  case 'replayed':return 'This batch was already applied.';
  case 'older-aggregate':return 'An older daily total was ignored.';
  case 'token-expired':return `${warning.type}: change history expired; missing records are kept.`;
  case 'initial-baseline':return `${warning.type}: initial snapshot; missing records are kept.`;
  case 'unmatched-delete':return 'A native deletion had no matching local record.';
  default:fail('Unsupported Health Connect warning.',409);
 }
}

/** Persist review in an account-private server row. Only summary goes to the client. */
export function previewHealthConnect(state,input,{ownerId}={}){
 account(ownerId);validateHealthExport(input);
 const prepared=source(()=>prepareHealthImport(state,input)),reviewToken=randomBytes(32).toString('hex');
 const review={version:1,ownerId,token:reviewToken,revision:digest(state),inputDigest:digest(input),sourceToken:prepared.reviewToken};
 return {review,summary:{reviewToken,counts:prepared.counts,range:prepared.range,warnings:prepared.warnings.map(healthWarningText)}};
}

/** review must come from the server's private account-scoped store, never request JSON. */
export function applyHealthConnectImport(state,input,{ownerId,review,reviewToken}={}){
 account(ownerId);validateHealthExport(input);
 if(!isRecord(review)||Object.keys(review).sort().join(',')!=='inputDigest,ownerId,revision,sourceToken,token,version'||
    review.version!==1||review.ownerId!==ownerId||!sameToken(review.token,reviewToken)||
    !token(review.sourceToken)||!token(review.revision)||!token(review.inputDigest))fail('Preview this export again.',409);
 if(digest(state)!==review.revision||digest(input)!==review.inputDigest)fail('The records or diary changed. Preview again.',409);
 return {counts:source(()=>importHealth(state,input,{reviewToken:review.sourceToken}))};
}

export function applyHealthConnectCommand(state,{type,payload},context={}){
 if(type!=='health.import')return {handled:false};
 if(!isRecord(payload)||Object.keys(payload).some(key=>!healthCommandFields['health.import'].includes(key))||!token(payload.reviewToken))fail('Preview this export again.');
 return {handled:true,result:applyHealthConnectImport(state,payload.export,{ownerId:context.ownerId,review:context.healthReview,reviewToken:payload.reviewToken})};
}
