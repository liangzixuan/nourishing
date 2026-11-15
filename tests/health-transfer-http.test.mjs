import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createWebHandler} from '../server/http.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {initializeHealthExportState} from '../server/health-export-state.mjs';
import {createHealthExport} from '../server/health-export.mjs';
import {previewHealthReconciliation,prepareHealthReconciliation,healthReconciliationReceipt} from '../server/health-reconciliation.mjs';
const origin='https://nourishing.example',reviewSecret='fixture-health-transfer-signing-secret',day='2026-11-14';
const selection={kind:'weight',from:day,to:day,metric:{type:'Weight',unit:'kg'},timeZone:'America/Chicago'};
function setup(){
 const states=new Map(['first','other'].map(id=>{const state=initialState();initializeHealthExportState(state);state.biometrics=[{id:'manual',date:day,time:'12:00',type:'Weight',unit:'kg',value:id==='first'?70:80}];return [id,state];})),calls=[];
 const current=async secret=>{calls.push('auth');if(!states.has(secret))throw Object.assign(Error('Sign in'),{code:401});return {$id:secret};};
 const state=secret=>{assert.ok(states.has(secret));return states.get(secret);},exporter=secret=>createHealthExport({readState:async()=>state(secret),ownerId:secret,reviewSecret,timeZone:'America/Chicago'});
 const service={current,healthExportOptions:async(secret,kind)=>{await current(secret);calls.push('export:'+kind+':options');return exporter(secret)[kind].options();},healthExportPreview:async(secret,kind,input)=>{await current(secret);calls.push('export:'+kind+':preview');return exporter(secret)[kind].preview(input);},healthExportVerify:async(secret,kind,input)=>{await current(secret);calls.push('export:'+kind+':verify');return exporter(secret)[kind].verify(input);},previewHealthReconciliation:async(secret,input)=>{calls.push('reconcile:preview');return previewHealthReconciliation(state(secret),input,{ownerId:secret,reviewSecret});},applyHealthReconciliation:async(secret,input)=>{calls.push('reconcile:apply');const prepared=prepareHealthReconciliation(state(secret),input,{ownerId:secret,reviewSecret});states.set(secret,prepared.state);return prepared.result;},healthReconciliationReceipt:async(secret,input)=>{await current(secret);calls.push('reconcile:receipt');return healthReconciliationReceipt(state(secret),input);}};
 return {handle:createWebHandler({config:{origin},service}),states,calls};
}
const post=(path,body,secret='first',headers={})=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:secret?'__Host-nourishing_session='+secret:'',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const get=(path,secret='first')=>new Request(origin+path,{headers:{Cookie:secret?'__Host-nourishing_session='+secret:''}});
const batch=()=>({format:'nourish-health-reconciliation',version:1,streamId:randomUUID(),batchId:randomUUID(),sequence:1,previousReceipt:null,observedAt:'2026-11-15T12:00:00Z',snapshot:{format:'nourish-health-connect',version:1,exportedAt:'2026-11-15T12:00:00Z',range:{from:day,to:'2026-11-15',zone:'UTC'},records:[]},nativeChanges:[],aggregateObservations:[],gaps:[{type:'Weight',reason:'initial-baseline'},{type:'Sleep',reason:'token-expired'}]});

test('health transfer authenticates before body consumption and rejects Origin, query, body budgets and methods',async()=>{
 const {handle,calls}=setup();for(const path of ['/api/health-connect/reconcile/preview?summary=1','/api/health-connect/reconcile/apply','/api/health-connect/export/biometric/preview','/api/health-connect/export/intake/verify']){
  for(const secret of ['', 'wrong']){const request=post(path,'invalid',secret);assert.equal((await handle(request)).status,401);assert.equal(request.bodyUsed,false);}
  const request=post(path,'invalid','first',{Origin:'https://other.example'});assert.equal((await handle(request)).status,403);assert.equal(request.bodyUsed,false);
 }
 for(const path of ['/api/health-connect/reconcile/preview?summary=1&summary=1','/api/health-connect/reconcile/preview?ownerId=other','/api/health-connect/reconcile/apply?summary=1','/api/health-connect/export/intake/preview?namespace=other']){const request=post(path,'invalid');assert.equal((await handle(request)).status,400);assert.equal(request.bodyUsed,false);}
 for(const [path,limit] of [['/api/health-connect/reconcile/preview?summary=1',20_000_000],['/api/health-connect/reconcile/apply',20_000_000],['/api/health-connect/export/intake/preview',16384]])assert.equal((await handle(post(path,' '.repeat(limit+1)))).status,413);
 assert.ok(calls.every(call=>call==='auth'));assert.equal((await handle(get('/api/health-connect/export/biometric/preview'))).status,404);
});

test('ordinary export routes preserve account identity, profile time zone and explicit verification without writes',async()=>{
 const {handle,states}=setup(),before=structuredClone(states.get('first'));
 const options=await handle(get('/api/health-connect/export/biometric/options'));assert.equal(options.status,200);const value=await options.json();assert.equal(value.accountId,'first');assert.equal(value.timeZone,'America/Chicago');assert.equal(options.headers.get('cache-control'),'no-store');assert.equal((await handle(get('/api/health-connect/export/intake/options'))).status,200);
 const preview=await (await handle(post('/api/health-connect/export/biometric/preview',selection))).json();assert.equal(preview.records[0].nativeValue,70);
 const verified=await handle(post('/api/health-connect/export/biometric/verify',{selection,reviewToken:preview.reviewToken}));assert.equal(verified.status,200);assert.equal((await verified.json()).valid,true);
 assert.equal((await handle(post('/api/health-connect/export/biometric/verify',{selection,reviewToken:preview.reviewToken},'other'))).status,409);
 for(const input of [{...selection,ownerId:'other'},{...selection,namespace:'other'}])assert.equal((await handle(post('/api/health-connect/export/biometric/preview',input))).status,400);
 assert.equal((await handle(get('/api/health-connect/export/biometric/options?ownerId=other'))).status,400);assert.equal((await handle(get('/api/health-connect/export/biometric/options',''))).status,401);assert.deepEqual(states.get('first'),before);
 const intake={kind:'nutrition',from:day,to:day,timeZone:'America/Chicago',interval:'recorded-minute'},plan=await (await handle(post('/api/health-connect/export/intake/preview',intake))).json();assert.equal((await handle(post('/api/health-connect/export/intake/verify',{selection:intake,reviewToken:plan.reviewToken}))).status,200);
});

test('Android reconciliation summary has exact fields and strings; apply and GET receipt retain source replay contract',async()=>{
 const {handle,states}=setup(),input=batch(),before=structuredClone(states.get('first'));const preview=await handle(post('/api/health-connect/reconcile/preview?summary=1',input));assert.equal(preview.status,200);const summary=await preview.json();assert.deepEqual(Object.keys(summary).sort(),['batchDigest','batchId','counts','range','receipt','replayed','reviewToken','warnings']);assert.ok(summary.warnings.length>0&&summary.warnings.every(row=>typeof row==='string'));assert.ok(summary.warnings.some(row=>row.includes('initial snapshot')));assert.ok(summary.warnings.some(row=>row.includes('expired')));assert.deepEqual(states.get('first'),before);
 const full=await (await handle(post('/api/health-connect/reconcile/preview',input))).json();assert.ok(Array.isArray(full.changes));assert.ok(full.warnings.every(row=>typeof row.code==='string'));
 const confirmation={batch:input,reviewToken:summary.reviewToken,confirmed:true,allowRemovals:false};assert.equal((await handle(post('/api/health-connect/reconcile/apply',{...confirmation,ownerId:'other'}))).status,400);assert.equal((await handle(post('/api/health-connect/reconcile/apply',confirmation,'other'))).status,409);
 const applied=await (await handle(post('/api/health-connect/reconcile/apply',confirmation))).json();assert.deepEqual(Object.keys(applied).sort(),['receipt','replayed']);assert.equal(applied.replayed,false);assert.equal(applied.receipt.recoverySnapshotId,null);
 const query=new URLSearchParams(Object.fromEntries(['streamId','sequence','batchId','batchDigest'].map(key=>[key,applied.receipt[key]]))),path='/api/health-connect/reconcile/receipt?'+query;
 const found=await handle(get(path));assert.equal(found.status,200);assert.deepEqual(await found.json(),{receipt:applied.receipt});assert.deepEqual(await (await handle(get(path,'other'))).json(),{receipt:null});
 const replay=await (await handle(post('/api/health-connect/reconcile/apply',confirmation))).json();assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,applied.receipt);
 const repeated=await (await handle(post('/api/health-connect/reconcile/preview?summary=1',input))).json();assert.deepEqual(repeated.warnings,['This batch was already applied.']);
 for(const suffix of ['&ownerId=other','&sequence=1'])assert.equal((await handle(get(path+suffix))).status,400);
 for(const sequence of ['0','1.1','1e0','9007199254740992']){const invalid=new URLSearchParams(query);invalid.set('sequence',sequence);assert.equal((await handle(get('/api/health-connect/reconcile/receipt?'+invalid))).status,400);}assert.equal((await handle(get(path,''))).status,401);
});
