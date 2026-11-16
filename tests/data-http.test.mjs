import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebHandler} from '../server/http.mjs';
const config={origin:'https://candidate.example'};
const cookie='__Host-nourishing_session=account-session';
const req=(path,signed=true)=>new Request(config.origin+path,{headers:signed?{cookie}:{}});
test('database conflicts do not claim an account already exists',async()=>{
 const conflict=async()=>{throw {code:409,type:'transaction_conflict'};},handle=createWebHandler({config,service:{charts:conflict,register:conflict}});
 const chart=await handle(req('/api/charts?to=2026-11-15'));assert.equal(chart.status,409);assert.equal((await chart.json()).error,'Your data changed. Please try again.');
 const signup=await handle(new Request(config.origin+'/api/auth/register',{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json'},body:JSON.stringify({email:'fixture@example.com',password:'test-password-123',name:'Test'})}));assert.equal(signup.status,409);assert.match((await signup.json()).error,/account with these details already exists/);
});
test('targets and reports enforce account and filter contracts',async()=>{
 let calls=0;const handle=createWebHandler({config,service:{targets:async(secret,date)=>{calls++;assert.equal(secret,'account-session');return {date};},nutritionReport:async(secret,options)=>{calls++;assert.equal(secret,'account-session');return options;}}});
 const query='from=2026-11-14&to=2026-11-14&dayFilter=all&includeToday=true&includeSupplements=false';
 for(const path of ['/api/targets?date=2026-11-14','/api/nutrition-report?'+query]){
  assert.equal((await handle(req(path,false))).status,401);assert.equal((await handle(req(path+'&ownerId=other'))).status,400);
 }
 assert.equal(calls,0);assert.equal((await handle(req('/api/targets?date=2026-11-14'))).status,200);
 const response=await handle(req('/api/nutrition-report?'+query));assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).includeSupplements,false);
 assert.equal((await handle(req('/api/nutrition-report?'+query+'&from=2026-11-13'))).status,400);
 assert.equal((await handle(req('/api/nutrition-report?'+query.replace('includeToday=true','includeToday=no')))).status,400);
});
test('library reads and previews require session, reject owner overrides and keep responses private',async()=>{
 let calls=0;const handle=createWebHandler({config,service:{library:async()=>{calls++;return {items:[]};},libraryItem:async(s,kind,id)=>({kind,id}),previewLibrary:async()=>{calls++;return {};}}});
 assert.equal((await handle(req('/api/library',false))).status,401);
 assert.equal((await handle(req('/api/library?ownerId=another'))).status,400);
 assert.equal((await handle(req('/api/library/item?kind=recipe&id=x&ownerId=another'))).status,400);
 assert.equal(calls,0);const result=await handle(req('/api/library'));assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');
 assert.equal((await handle(req('/api/library/item?kind=profile&id=x'))).status,400);
 const post=origin=>new Request(config.origin+'/api/library/preview',{method:'POST',headers:{cookie,origin,'Content-Type':'application/json'},body:'{}'});
 assert.equal((await handle(post('https://another.example'))).status,403);assert.equal((await handle(post(config.origin))).status,200);
});
test('diary commands require an authenticated same-origin request',async()=>{
 let called=0;const handle=createWebHandler({config,service:{workspaceCommand:async(secret,body)=>{called++;assert.equal(secret,'account-session');return {ok:true};}}});
 const make=(signed,origin)=>new Request(config.origin+'/api/workspace/command',{method:'POST',headers:{...(signed?{cookie}:{}),origin,'Content-Type':'application/json'},body:'{}'});
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
