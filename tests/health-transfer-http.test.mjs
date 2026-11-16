import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebHandler} from '../server/http.mjs';
import {createAppwriteService} from '../server/appwrite-service.mjs';
const origin='https://nourishing.example';
const removed=[
 ['POST','/api/health-connect/preview?summary=1'],
 ['POST','/api/health-connect/import?summary=1'],
 ['POST','/api/health-connect/reconcile/preview?summary=1'],
 ['POST','/api/health-connect/reconcile/apply'],
 ['GET','/api/health-connect/reconcile/receipt?streamId=former'],
 ...['biometric','intake'].flatMap(kind=>[['GET',`/api/health-connect/export/${kind}/options`],['POST',`/api/health-connect/export/${kind}/preview`],['POST',`/api/health-connect/export/${kind}/verify`]]),
 ['GET','/api/home-widgets'],
];
test('PWA rejects removed Health Connect and native widget endpoints without calling services',async()=>{
 let called=false;
 const service=new Proxy({}, {get(){called=true;throw Error('Removed feature must not reach a service.');}});
 const handle=createWebHandler({config:{origin},service});
 for(const [method,path] of removed)for(const signed of [false,true]){
  const response=await handle(new Request(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(signed?{Cookie:'__Host-nourishing_session=fixture'}:{})},...(method==='POST'?{body:'{}'}:{})}));
  assert.equal(response.status,404,method+' '+path);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{error:'Not found.',errorCode:'request.notFound'});
 }
 assert.equal(called,false);
});
test('cloud service exposes no Health Connect or native widget operations',()=>{
 const service=createAppwriteService({endpoint:'https://api.example/v1',project:'fixture',database:'nourishing',origin},'');
 for(const name of ['previewHealth','importHealth','healthExportOptions','healthExportPreview','healthExportVerify','previewHealthReconciliation','applyHealthReconciliation','healthReconciliationReceipt','homeWidgets'])assert.equal(Object.hasOwn(service,name),false,name);
});
