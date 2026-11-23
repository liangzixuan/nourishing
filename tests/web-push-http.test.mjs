import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebHandler} from '../server/http.mjs';
const origin='https://nourishing.example';
const post=(path,body='{}',headers={})=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'__Host-nourishing_session=fixture',...headers},body});
function fixture(){
 const calls=[],service={current:async secret=>{calls.push(['auth',secret]);if(secret!=='fixture')throw Object.assign(Error('Sign in'),{code:401});},reminders:async secret=>{calls.push(['status',secret]);return {configured:true,paused:true,devices:[]};}};
 service.pushConnection=async secret=>{calls.push(['connection',secret]);return {configured:true,devices:[]};};
 for(const method of ['subscribePush','unsubscribePush','testPush'])service[method]=async(secret,input)=>{calls.push([method,secret,input]);return {ok:true};};
 return {calls,handle:createWebHandler({config:{origin},service})};
}
test('notification status is authenticated, owner-free, query-free and not cached',async()=>{
 for(const [path,operation] of [['/api/reminders','status'],['/api/reminders/connection','connection']]){
  const {handle,calls}=fixture();assert.equal((await handle(new Request(origin+path))).status,401);
  assert.equal((await handle(new Request(origin+path+'?ownerId=other',{headers:{Cookie:'__Host-nourishing_session=fixture'}}))).status,400);assert.deepEqual(calls,[]);
  const response=await handle(new Request(origin+path,{headers:{Cookie:'__Host-nourishing_session=fixture'}}));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(calls,[[operation,'fixture']]);
 }
});
test('notification writes authenticate before parsing and retain Origin, JSON and body-size checks',async()=>{
 for(const [suffix,method]of [['subscribe','subscribePush'],['unsubscribe','unsubscribePush'],['test','testPush']]){
  const path='/api/reminders/'+suffix,{handle,calls}=fixture();
  assert.equal((await handle(post(path,'invalid',{Cookie:''}))).status,401);assert.deepEqual(calls,[]);
  assert.equal((await handle(post(path,'invalid',{Cookie:'__Host-nourishing_session=other'}))).status,401);
  assert.equal((await handle(post(path+'?ownerId=other','invalid'))).status,400);
  assert.equal((await handle(post(path,'{}',{Origin:'https://foreign.example'}))).status,403);
  assert.equal((await handle(post(path,'{}',{'Content-Type':'text/plain'}))).status,415);
  assert.equal((await handle(post(path,' '.repeat(16385)))).status,413);
  assert.equal(calls.some(call=>call[0]!=='auth'),false);
  const input={synthetic:'forwarded to validated service'};assert.equal((await handle(post(path,JSON.stringify(input)))).status,200);assert.deepEqual(calls.at(-1),[method,'fixture',input]);
 }
});
