import test from 'node:test';
import assert from 'node:assert/strict';
import {MockAgent,getGlobalDispatcher,setGlobalDispatcher} from 'undici';
import {createAppwriteService} from '../server/appwrite-service.mjs';
import {createWebHandler} from '../server/http.mjs';
import {installLifecycleHttpMock} from './fixtures/lifecycle-http.mjs';

test('actual photo service maps invalid stored images to 400 before any storage write',async()=>{
 const previous=getGlobalDispatcher(),mock=new MockAgent();mock.disableNetConnect();setGlobalDispatcher(mock);const remote=mock.get('https://appwrite.fixture.invalid');
 remote.intercept({method:'GET',path:'/v1/account'}).reply(200,{$id:'fixture-owner',email:'fixture@example.com',emailVerification:true},{headers:{'content-type':'application/json'}}).persist();
 remote.intercept({method:'GET',path:'/v1/tablesdb/nourishing/tables/profiles/rows/fixture-owner'}).reply(200,{timeZone:'UTC',units:'metric'},{headers:{'content-type':'application/json'}}).persist();

 const {gate,operations,transactions,labels}=installLifecycleHttpMock(remote);let storageCalls=0;
 remote.intercept({method:'POST',path:/^\/v1\/storage\//}).reply(()=>{storageCalls++;return {statusCode:500,data:'Unexpected storage write'};}).persist();
 try{const config={origin:'https://nourishing.example',endpoint:'https://appwrite.fixture.invalid/v1',project:'fixture',database:'nourishing',profileTable:'profiles'},service=createAppwriteService(config,'fixture-server-key'),handler=createWebHandler({config,service});const photo={id:'a'.repeat(64),dataUrl:'data:image/jpeg;base64,YmFk'},note={requestId:'fixture-request-123456',revision:'b'.repeat(64),id:null,recordRevision:null,fields:{date:'2026-11-15',time:'12:00',text:'Fixture',group:'Lunch'},photo:{mode:'replace',...photo}};
  for(const [path,body]of [['/api/photos/save',{photo}],['/api/snapshots/save',{photo}],['/api/note-photos/save',note],['/api/note-photos/prepare',{dataUrl:photo.dataUrl}]]){const response=await handler(new Request(config.origin+path,{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json',Cookie:'__Host-nourishing_session=fixture-session'},body:JSON.stringify(body)}));assert.equal(response.status,400,path);assert.equal(response.headers.get('cache-control'),'no-store');assert.ok(typeof(await response.json()).error==='string');}
  assert.deepEqual(labels,['savePhoto','saveSnapshot','saveNotePhoto','prepareNotePhoto']);assert.equal(operations.size,0);assert.equal(transactions.size,0);assert.equal(gate.version,4);assert.equal(storageCalls,0);
 }finally{setGlobalDispatcher(previous);await mock.close();}
});
