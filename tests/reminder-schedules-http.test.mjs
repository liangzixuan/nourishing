import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebHandler} from '../server/http.mjs';

const origin='https://nourishing.example';
const post=(path,body='{}',headers={})=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'__Host-nourishing_session=fixture',...headers},body});
function fixture(){
 const calls=[],service={current:async secret=>{calls.push(['auth',secret]);if(secret!=='fixture')throw Object.assign(Error('Sign in'),{code:401});}};
 for(const name of ['saveReminder','deleteReminder','reminderSettings'])service[name]=async(secret,input)=>{calls.push([name,secret,input]);return {paused:true,revision:4};};
 return {calls,handle:createWebHandler({config:{origin},service})};
}

test('scheduled reminder writes use authenticated owner, Origin, JSON and bounded bodies',async()=>{
 for(const [suffix,method,input] of [
  ['schedule','saveReminder',{revision:3,schedule:{creationId:'synthetic',kind:'daily'}}],
  ['schedule/delete','deleteReminder',{revision:3,id:'synthetic'}],
  ['settings','reminderSettings',{revision:3,paused:false}],
 ]){
  const path='/api/reminders/'+suffix,{handle,calls}=fixture();
  assert.equal((await handle(post(path,'invalid',{Cookie:''}))).status,401);assert.deepEqual(calls,[]);
  assert.equal((await handle(post(path,'invalid',{Cookie:'__Host-nourishing_session=other'}))).status,401);
  assert.equal((await handle(post(path+'?ownerId=other','invalid'))).status,400);
  assert.equal((await handle(post(path,'{}',{Origin:'https://foreign.example'}))).status,403);
  assert.equal((await handle(post(path,'{}',{'Content-Type':'text/plain'}))).status,415);
  assert.equal((await handle(post(path,' '.repeat(16385)))).status,413);
  assert.equal(calls.some(call=>call[0]!=='auth'),false);
  const response=await handle(post(path,JSON.stringify(input)));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(calls.at(-1),[method,'fixture',input]);assert.deepEqual(await response.json(),{paused:true,revision:4});
 }
});
