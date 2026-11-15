import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebHandler} from '../server/http.mjs';
const origin='https://nourishing.example',cookie='__Host-nourishing_session=fixture';
const post=(body,headers={},query='')=>new Request(origin+'/api/offline/commands'+query,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...headers},body});
test('offline copy is authenticated, query-free, and never HTTP cached',async()=>{
 let calls=0;const handle=createWebHandler({config:{origin},service:{offlineSnapshot:async secret=>{assert.equal(secret,'fixture');calls++;return {identity:{ownerId:'account',generation:'current'},version:1};}}});
 assert.equal((await handle(new Request(origin+'/api/offline'))).status,401);
 assert.equal((await handle(new Request(origin+'/api/offline?owner=other',{headers:{Cookie:cookie}}))).status,400);assert.equal(calls,0);
 const response=await handle(new Request(origin+'/api/offline',{headers:{Cookie:cookie}}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(calls,1);
});
test('offline replay authenticates before reading the body and forwards original immutable envelope',async()=>{
 const calls=[],handle=createWebHandler({config:{origin},service:{current:async secret=>{if(secret!=='fixture')throw {code:401};},offlineCommand:async(secret,input)=>{calls.push({secret,input});return {replayed:false};}}});
 assert.equal((await handle(post('invalid',{Cookie:''}))).status,401);
 assert.equal((await handle(post('invalid',{Cookie:'__Host-nourishing_session=wrong'}))).status,401);
 assert.equal((await handle(post('invalid',{},'?owner=other'))).status,400);
 assert.equal((await handle(post('{}',{Origin:'https://foreign.example'}))).status,403);
 assert.equal((await handle(post('{}',{'Content-Type':'text/plain'}))).status,415);
 assert.equal((await handle(post(' '.repeat(601001)))).status,413);assert.equal(calls.length,0);
 const input={ownerId:'account',generation:'current',operationId:'f1f3073b-9800-4dbf-9a52-7f59bac0f750',type:'note.add',payload:{date:'2026-11-15',text:'a'.repeat(100000)}};
 assert.equal((await handle(post(JSON.stringify(input)))).status,200);assert.deepEqual(calls,[{secret:'fixture',input}]);
});
