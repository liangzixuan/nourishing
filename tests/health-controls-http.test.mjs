import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebHandler} from '../server/http.mjs';
const origin='https://nourishing.example',cookie='__Host-nourishing_session=fixture';
function fixture(){const calls=[],service={current:async secret=>{if(secret!=='fixture')throw {code:401};calls.push(['auth']);}};for(const name of ['glucoseTimeline','cycleView','cycleImportPreview','cycleRemovalPreview','workspaceCommand'])service[name]=async(secret,input)=>{calls.push([name,secret,input]);return {ok:true};};return {calls,handle:createWebHandler({config:{origin},service})};}
const get=(path,cookieValue=cookie)=>new Request(origin+path,{headers:{Cookie:cookieValue}});
const post=(path,body,cookieValue=cookie)=>new Request(origin+path,{method:'POST',headers:{Cookie:cookieValue,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('health reads reject foreign scope, duplicate fields and malformed comparisons',async()=>{
 const {handle,calls}=fixture();
 for(const path of ['/api/cycle','/api/glucose-timeline']){
  assert.equal((await handle(get(path+'?from=2026-11-01&to=2026-11-15',''))).status,401);
  for(const query of ['from=2026-11-01','from=a&from=b&to=c','from=a&to=b&ownerId=other'])assert.equal((await handle(get(path+'?'+query))).status,400);
 }
 assert.equal((await handle(get('/api/glucose-timeline?from=a&to=b&compare=broken'))).status,400);assert.equal(calls.length,0);
 const response=await handle(get('/api/glucose-timeline?'+new URLSearchParams({from:'2026-11-01',to:'2026-11-15',compare:JSON.stringify({kind:'exercise',id:'duration'})})));
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(calls.at(-1),['glucoseTimeline','fixture',{from:'2026-11-01',to:'2026-11-15',compare:{kind:'exercise',id:'duration'}}]);
});
test('cycle preview and writes authenticate before large bodies and constrain the command type',async()=>{
 const {handle,calls}=fixture();
 assert.equal((await handle(post('/api/cycle/preview',{},''))).status,401);assert.equal((await handle(post('/api/cycle/preview',{},'__Host-nourishing_session=other'))).status,401);assert.equal(calls.length,0);
 assert.equal((await handle(post('/api/cycle/preview?ownerId=other',{}))).status,400);
 assert.equal((await handle(post('/api/cycle/import',{type:'entry.delete'}))).status,400);
 assert.equal((await handle(post('/api/cycle/remove',{type:'cycle.import'}))).status,400);
 assert.equal((await handle(post('/api/cycle/preview',{data:'x'.repeat(20_000_000)}))).status,413);
 for(const [path,name,body] of [['preview','cycleImportPreview',{records:[]}],['removal-preview','cycleRemovalPreview',{ids:['a']}],['import','workspaceCommand',{type:'cycle.import'}],['remove','workspaceCommand',{type:'cycle.remove'}]]){
  const response=await handle(post('/api/cycle/'+path,body));assert.equal(response.status,200);assert.deepEqual(calls.at(-1),[name,'fixture',body]);
 }
});
