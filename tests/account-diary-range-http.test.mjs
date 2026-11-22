import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebHandler} from '../server/http.mjs';
import {MockAgent,getGlobalDispatcher,setGlobalDispatcher} from 'undici';
import {createAppwriteService} from '../server/appwrite-service.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {digest,packWorkspace,rowId} from '../server/data-codec.mjs';
import {encodeCommandReceipt} from '../server/command-receipt-codec.mjs';
import {installLifecycleHttpMock} from './fixtures/lifecycle-http.mjs';

test('Account Data range deletion binds the chosen owner and requires explicit confirmation and reauthentication',async()=>{
 const origin='https://nourishing.test',calls=[],scope={start:'2026-11-01',end:'2026-11-07',types:['notes'],timeZone:'UTC'};
 const revision='f'.repeat(64),requestId='a0bd8e92-44c8-4cfc-8ddc-75ae2671075e',ownerId='fixture-owner';
 const handler=createWebHandler({config:{origin},assets:new Map(),service:{
  authenticate:async()=>{},previewDiaryRangeRemoval:async(secret,input)=>{calls.push(['preview',input]);return {ownerId,revision,removed:{notes:2}};},
  removeDiaryRange:async(secret,owner,password,input)=>{assert.equal(secret,'fixture');assert.equal(password,'fixture password');assert.equal(owner,ownerId);assert.deepEqual(input,{...scope,requestId,revision});calls.push(['remove']);return {ok:true,revision,removed:{notes:2}};}
 }});
 const send=(action,body,{cookie=true,from=origin}={})=>handler(new Request(origin+'/api/account/diary-data/'+action,{method:'POST',headers:{Origin:from,'Content-Type':'application/json',...(cookie?{Cookie:'__Host-nourishing_session=fixture'}:{})},body:JSON.stringify(body)}));
 assert.equal((await send('preview',scope,{cookie:false})).status,401);
 const preview=await send('preview',scope);assert.equal(preview.status,200);assert.deepEqual((await preview.json()).removed,{notes:2});
 const payload={...scope,requestId,revision,ownerId,password:'fixture password',confirmation:'delete'};
 assert.equal((await send('delete',{...payload,confirmation:'no'})).status,400);
 assert.equal((await send('delete',{...payload,password:''})).status,400);
 assert.equal((await send('delete',{...payload,unknown:3})).status,400);
 assert.equal((await send('delete',payload,{from:'https://unrelated.test'})).status,403);
 assert.deepEqual(calls,[['preview',scope]]);
 const saved=await send('delete',payload);assert.equal(saved.status,200);assert.equal((await saved.json()).ok,true);
 assert.equal(saved.headers.get('cache-control'),'no-store');assert.equal(calls.length,2);
});

test('the account service checks the reviewed owner and current password before replaying even an acknowledged deletion',async()=>{
 const origin='https://nourishing.test',ownerId='fixture-owner',email='fixture@example.com';
 const scope={start:'2026-11-01',end:'2026-11-07',timeZone:'UTC',types:['notes']},requestId='d3c92f6c-02ea-48a8-9a1c-52d97d5dfa51';
 const state=initialState();
 state.notes=[{id:'one',date:scope.start,time:'10:00',text:'sample',group:'Lunch'}];
 const packed=packWorkspace(state,ownerId,'fixture-generation'),revision=packed.head.digest;
 const previous=getGlobalDispatcher(),mock=new MockAgent();mock.disableNetConnect();setGlobalDispatcher(mock);
 try{
  const remote=mock.get('https://appwrite.fixture.invalid'),json={headers:{'content-type':'application/json'}};
  const gate=installLifecycleHttpMock(remote,{ownerId});
  const read=(path,value)=>remote.intercept({method:'GET',path}).reply(200,value,json).persist();
  read('/v1/account',{$id:ownerId,email,emailVerification:true});
  const base='/v1/tablesdb/nourishing/tables/';
  read(base+'workspace_heads/rows/'+ownerId,{$id:ownerId,$permissions:[`read("user:${ownerId}")`],...packed.head});
  read(/^\/v1\/tablesdb\/nourishing\/tables\/workspace_records\/rows\?/, {rows:packed.rows});
  const config={origin,endpoint:'https://appwrite.fixture.invalid/v1',project:'fixture',database:'nourishing',profileTable:'profiles'};
  const handler=createWebHandler({config,service:createAppwriteService(config,'fixture-key')});
  const post=(path,body)=>handler(new Request(origin+'/api/account/diary-data/'+path,{method:'POST',headers:{origin,'content-type':'application/json',cookie:'__Host-nourishing_session=fixture'},body:JSON.stringify(body)}));
  const preview=await post('preview',scope);
  assert.equal(preview.status,200,await preview.clone().text());
  const reviewed=await preview.json();assert.equal(reviewed.ownerId,ownerId);assert.equal(reviewed.revision,revision);assert.equal(reviewed.removed.notes,1);
  const input={...scope,ownerId,requestId,revision,password:'fixture-correct',confirmation:'delete'};
  assert.equal((await post('delete',{...input,ownerId:'switched'})).status,409);
  remote.intercept({method:'POST',path:base+'login_limits/rows'}).reply(201,{attempts:1},json).persist();
  read(/^\/v1\/tablesdb\/nourishing\/tables\/login_limits\/rows\?/,{rows:[]});
  const login={method:'POST',path:'/v1/account/sessions/email'};
  remote.intercept(login).reply(401,{code:401,type:'user_invalid_credentials',message:'Invalid credentials.'},json);
  assert.equal((await post('delete',{...input,password:'fixture-wrong'})).status,401);
  const order=[];
  remote.intercept(login).reply(options=>{
   assert.deepEqual(JSON.parse(options.body),{email,password:'fixture-correct',duration:60});order.push('password');
   return {statusCode:201,data:{$id:'proof',userId:ownerId},responseOptions:json};
  });
  remote.intercept({method:'DELETE',path:'/v1/users/'+ownerId+'/sessions/proof'}).reply(()=>{order.push('release proof session');return {statusCode:204};});
  const received={ok:true,revision:'a'.repeat(64),removed:reviewed.removed};
  remote.intercept({method:'GET',path:base+'command_receipts/rows/'+rowId(ownerId,requestId)}).reply(()=>{
   order.push('receipt');
   return {statusCode:200,data:{ownerId,fingerprint:digest({type:'diary.range.remove',requestId,revision,range:scope}),result:encodeCommandReceipt(received)},responseOptions:json};
  });
  const replay=await post('delete',input);
  assert.equal(replay.status,200,await replay.clone().text());assert.deepEqual(await replay.json(),received);
  assert.deepEqual(order,['password','release proof session','receipt']);
  assert.deepEqual(gate.labels,['previewDiaryRangeRemoval','removeDiaryRange','removeDiaryRange','removeDiaryRange']);
  assert.equal(gate.operations.size,0);
 }finally{setGlobalDispatcher(previous);await mock.close();}
});
