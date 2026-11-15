import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebHandler} from '../server/http.mjs';
import {BARCODE_BODY_BYTES} from '../server/barcode.mjs';
const origin='https://fixture.example',paths=['/api/barcode/lookup','/api/barcode/preview','/api/barcode/save','/api/branded/search'];
const req=(path,body='{}',signed=true,from=origin)=>new Request(origin+path,{method:'POST',headers:{origin:from,'content-type':'application/json',...(signed?{cookie:'__Host-nourishing_session=fixture'}:{})},body});
test('barcode paths authenticate before large bodies and reject foreign origins/query overrides',async()=>{
 const handler=createWebHandler({config:{origin},service:{current:async()=>{throw {code:401};}}});
 for(const path of paths)for(const [signed,from,status]of [[false,origin,401],[true,origin,401],[true,'https://other.example',403]]){
  const real=req(path,'{}',signed,from);assert.equal((await handler({url:real.url,method:real.method,headers:real.headers,get body(){throw Error('Unauthorized body read');}})).status,status);
 }
});
test('barcode routes retain large signed provenance, bound capacity and keep private cache policy',async()=>{
 const calls=[],service={current:async()=>({$id:'fixture'})};for(const method of ['barcodeLookup','barcodePreview','barcodeSave','brandedSearch'])service[method]=async(secret,body)=>{calls.push({method,body});return {ok:true};};
 const handler=createWebHandler({config:{origin},service});
 for(const path of paths){assert.equal((await handler(req(path+'?owner=other'))).status,400);assert.equal((await handler(req(path,'x'.repeat(BARCODE_BODY_BYTES+1)))).status,413);const response=await handler(req(path,JSON.stringify({reviewToken:'x'.repeat(20000)})));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-security-policy'),/script-src 'self' 'wasm-unsafe-eval';/);assert.doesNotMatch(response.headers.get('content-security-policy'),/'unsafe-eval'|'unsafe-inline'/);}
 assert.equal(calls.length,4);assert.ok(calls.every(call=>call.body.reviewToken.length===20000));
});
