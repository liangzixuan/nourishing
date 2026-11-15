import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebHandler} from '../server/http.mjs';
const origin='https://nourishing.example';
function setup(){const calls=[];const service={current:async secret=>{calls.push('auth');if(secret!=='fixture')throw Object.assign(Error('Sign in'),{code:401});},inspectBackup:async()=>{calls.push('inspect');return {ok:true};},uploadBackupMedia:async()=>{calls.push('media');return {ok:true};},restoreBackup:async()=>{calls.push('restore');return {ok:true};},exportBackup:async()=>({ok:true})};return {calls,handle:createWebHandler({config:{origin},service})};}
const post=(path,body,headers={})=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'__Host-nourishing_session=fixture',...headers},body});
test('backup body parsing follows authentication, query and Origin checks',async()=>{
 const {handle,calls}=setup();assert.equal((await handle(post('/api/backup/inspect','invalid',{Cookie:''}))).status,401);assert.deepEqual(calls,[]);
 assert.equal((await handle(post('/api/backup/inspect','invalid',{Cookie:'__Host-nourishing_session=wrong'}))).status,401);assert.deepEqual(calls,['auth']);
 assert.equal((await handle(post('/api/backup/inspect?ownerId=other','invalid'))).status,400);assert.deepEqual(calls,['auth','auth']);
 assert.equal((await handle(post('/api/backup/restore','{}',{Origin:'https://other.example'}))).status,403);assert.deepEqual(calls,['auth','auth']);
});
test('backup HTTP caps include JSON overhead and use the intended service operation',async()=>{
 const {handle,calls}=setup();for(const [path,limit]of [['inspect',20_000_000],['media',5*1024*1024],['restore',16384]]){
  assert.equal((await handle(post('/api/backup/'+path,' '.repeat(limit+1)))).status,413);
  assert.equal((await handle(post('/api/backup/'+path,'{}'))).status,200);
 }assert.deepEqual(calls,['auth','auth','inspect','auth','auth','media','auth','auth','restore']);
});
