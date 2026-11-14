import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebHandler} from '../server/http.mjs';
const config={origin:'https://candidate.example'};
const cookie='__Host-nourishing_session=account-session';
const req=(path,signed=true)=>new Request(config.origin+path,{headers:signed?{cookie}:{}});
test('diary commands require an authenticated same-origin request',async()=>{
 let called=0;const handle=createWebHandler({config,service:{diaryCommand:async(secret,body)=>{called++;assert.equal(secret,'account-session');return {ok:true};}}});
 const make=(signed,origin)=>new Request(config.origin+'/api/diary/command',{method:'POST',headers:{...(signed?{cookie}:{}),origin,'Content-Type':'application/json'},body:'{}'});
 assert.equal((await handle(make(false,config.origin))).status,401);assert.equal((await handle(make(true,'https://elsewhere.example'))).status,403);assert.equal(called,0);
 const response=await handle(make(true,config.origin));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(called,1);
});
test('data reads require a session and do not accept caller-selected owners',async()=>{
 let calls=0;const handle=createWebHandler({config,service:{readDiary:async()=>{calls++;return {};}}});
 assert.equal((await handle(req('/api/diary?date=2026-11-14',false))).status,401);
 assert.equal((await handle(req('/api/diary?date=2026-11-14&ownerId=another'))).status,400);
 assert.equal(calls,0);
});
test('diary API passes the session and day, rejects impossible dates, and stays private',async()=>{
 const handle=createWebHandler({config,service:{readDiary:async(secret,date)=>{assert.equal(secret,'account-session');assert.equal(date,'2026-11-14');return {date,entries:[]};}}});
 assert.equal((await handle(req('/api/diary?date=2026-02-31'))).status,400);
 const response=await handle(req('/api/diary?date=2026-11-14'));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('catalog reads reject invalid paging and media stays behind the account boundary',async()=>{
 const handle=createWebHandler({config,service:{searchCatalog:async(secret,args)=>args,readMedia:async()=>Buffer.from('jpeg')}});
 assert.equal((await handle(req('/api/catalog/search?q=rice&limit=10000'))).status,400);
 const r=await handle(req('/api/catalog/search?q=rice&limit=10'));assert.equal(r.status,200);assert.equal((await r.json()).query,'rice');
 assert.equal((await handle(req('/api/media?namespace=meal_photos&id=abc',false))).status,401);
});
