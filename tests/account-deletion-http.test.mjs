import test from 'node:test';import assert from 'node:assert/strict';
import {deletionCookie,readDeletionTicket} from '../server/deletion-cookie.mjs';
import {createWebHandler} from '../server/http.mjs';
const origin='https://nourishing.example',ticket={id:'test-job',secret:'a'.repeat(64)};
test('deletion receipt is host-only HttpOnly and rejects ambiguous or malformed cookies',()=>{
 const cookie=deletionCookie(ticket);assert.match(cookie,/__Host-nourishing_deletion=test-job\./);for(const flag of ['Path=/','HttpOnly','Secure','SameSite=Strict'])assert.ok(cookie.includes(flag));assert.deepEqual(readDeletionTicket(cookie),ticket);assert.equal(readDeletionTicket(''),null);assert.throws(()=>readDeletionTicket(cookie+'; '+cookie),{code:400});assert.throws(()=>readDeletionTicket('__Host-nourishing_deletion=bad'),{code:400});
});
test('deletion routes keep receipt out of JSON, authenticate prepare/confirm and allow status after session revocation',async()=>{
 const calls=[],handler=createWebHandler({config:{origin},service:{current:async secret=>{calls.push(['auth',secret]);return {id:'owner'};},prepareAccountDeletion:async(secret,input)=>{calls.push(['prepare',secret,input]);return {ticket,status:{status:'ready'}};},confirmAccountDeletion:async(secret,receipt)=>{calls.push(['confirm',secret,receipt]);return {status:'pending'};},accountDeletionStatus:async receipt=>{calls.push(['status',receipt]);return {status:'deleted'};}}});
 const request=(path,body,cookie='__Host-nourishing_session=fixture',from=origin)=>handler(new Request(origin+path,{method:'POST',headers:{Origin:from,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)}));
 assert.equal((await request('/api/account/deletion/prepare',{password:'password'},'')).status,401);
 assert.equal((await request('/api/account/deletion/prepare',{password:'password',ownerId:'victim'})).status,400);
 assert.equal((await request('/api/account/deletion/prepare',{password:'password'},undefined,'https://foreign.example')).status,403);
 const prepared=await request('/api/account/deletion/prepare',{password:'password'});assert.equal(prepared.status,200);assert.deepEqual(await prepared.json(),{status:'ready'});assert.match(prepared.headers.get('set-cookie'),/HttpOnly/);const receipt=prepared.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('/api/account/deletion/confirm',{confirmation:'wrong'},'__Host-nourishing_session=fixture; '+receipt)).status,400);
 const confirmed=await request('/api/account/deletion/confirm',{confirmation:'delete'},'__Host-nourishing_session=fixture; '+receipt);assert.equal(confirmed.status,202);assert.match(confirmed.headers.get('set-cookie'),/Max-Age=0/);
 const status=await request('/api/account/deletion/status',{},receipt);assert.equal(status.status,200);assert.deepEqual(await status.json(),{status:'deleted'});assert.equal(status.headers.get('cache-control'),'no-store');assert.deepEqual(calls.at(-1),['status',ticket]);
 assert.equal((await request('/api/account/deletion/status',{},'')).status,404);
 assert.equal((await request('/api/account/deletion/status?owner=victim',{},receipt)).status,400);
});
