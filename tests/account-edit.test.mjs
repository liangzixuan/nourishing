import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAccountEdit,editAccount} from '../server/account-edit.mjs';
import {createWebHandler} from '../server/http.mjs';
import {createAppwriteService} from '../server/appwrite-service.mjs';
import {MockAgent,getGlobalDispatcher,setGlobalDispatcher} from 'undici';
import {installLifecycleHttpMock} from './fixtures/lifecycle-http.mjs';
const user={$id:'alice',name:'Alice',email:'alice@example.com',emailVerification:true,password:'PRIVATE',sessions:['PRIVATE']};
test('Account edit uses only session-bound SDK methods and returns a minimal identity',async()=>{
 const calls=[],account=Object.fromEntries(['updateName','updateEmail','updatePassword'].map(method=>[method,async input=>{calls.push({method,input});return user;}]));
 for(const input of [{kind:'name',name:' Alice '},{kind:'email',email:'new@example.com',password:'current-password'},{kind:'password',password:'new-password',oldPassword:'current-password'}]){const result=await editAccount(account,input);assert.deepEqual(result,{ok:true,account:{id:'alice',name:'Alice',email:'alice@example.com',emailVerified:true}});assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);}
 assert.deepEqual(calls,[{method:'updateName',input:{name:'Alice'}},{method:'updateEmail',input:{email:'new@example.com',password:'current-password'}},{method:'updatePassword',input:{password:'new-password',oldPassword:'current-password'}}]);
 for(const input of [{kind:'constructor'},{kind:'toString'},{kind:'__proto__'},{kind:'name',name:' '},{kind:'name',name:'Alice',ownerId:'bob'},{kind:'email',email:'bad',password:'current-password'},{kind:'password',password:'short',oldPassword:'current-password'},{kind:'password',password:'new-password'}])assert.throws(()=>parseAccountEdit(input),e=>e.code===400);
});
test('Account edit errors omit provider details and ambiguous provider success is not acknowledged',async()=>{
 for(const code of [400,401,403,409,429,500,503,undefined]){await assert.rejects(editAccount({updateName:async()=>{throw Object.assign(Error('PRIVATE_CREDENTIAL'),{code});}},{kind:'name',name:'Alice'}),e=>{assert.doesNotMatch(e.message,/PRIVATE/);return e.code===(code===500||code===undefined?503:code);});}
 await assert.rejects(editAccount({updateName:async()=>({$id:'alice'})},{kind:'name',name:'Alice'}),e=>e.code===503);
});
test('Account update HTTP boundary rejects anonymous, cross-origin, query and owner injection; sessions stay isolated',async()=>{
 const calls=[],handler=createWebHandler({config:{origin:'https://app.example'},service:{updateAccount:async(secret,input)=>{calls.push({secret,input});return {ok:true,account:{id:secret,name:input.name,email:secret+'@example.com',emailVerified:true}};}}});
 const request=(input,{cookie='alice',origin='https://app.example',path='/api/account/update'}={})=>handler(new Request('https://app.example'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:'__Host-nourishing_session='+cookie}:{})},body:JSON.stringify(input)}));
 for(const [input,options,status]of [[{kind:'name',name:'A'},{cookie:null},401],[{kind:'name',name:'A'},{origin:'https://other.example'},403],[{kind:'name',name:'A'},{path:'/api/account/update?owner=bob'},400],[{kind:'name',name:'A',ownerId:'bob'},{},400]])assert.equal((await request(input,options)).status,status);assert.equal(calls.length,0);
 for(const cookie of ['alice','bob']){const response=await request({kind:'name',name:cookie},{cookie});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal((await response.json()).account.id,cookie);}assert.deepEqual(calls.map(row=>row.secret),['alice','bob']);
});

test('Account credential dialog confirms with Appwrite, releases the proof session and updates only the same signed-in session',async()=>{
 const origin='https://app.fixture.invalid',endpoint='https://appwrite.fixture.invalid';
 const previous=getGlobalDispatcher(),mock=new MockAgent();mock.disableNetConnect();setGlobalDispatcher(mock);
 try{
  const remote=mock.get(endpoint),json={headers:{'content-type':'application/json'}};
  const ownerId='owner',email='prior@example.test',password='current-fixture-password';
  const lifecycle=installLifecycleHttpMock(remote,{ownerId});
  const config={origin,endpoint:endpoint+'/v1',project:'fixture',database:'nourishing',profileTable:'profiles'};
  const handler=createWebHandler({config,service:createAppwriteService(config,'fixture-key')});
  const post=(path,body,session='fixture')=>handler(new Request(origin+'/api/account/'+path,{method:'POST',headers:{origin,'content-type':'application/json',...(session?{cookie:'__Host-nourishing_session='+session}:{})},body:JSON.stringify(body)}));
  assert.equal((await post('reauthenticate',{ownerId,password},null)).status,401);
  assert.equal((await post('reauthenticate',{ownerId,password,other:'x'})).status,400);
  const account={$id:ownerId,name:'Fixture',email,emailVerification:true};
  remote.intercept({method:'GET',path:'/v1/account'}).reply(200,account,json).persist();
  assert.equal((await post('reauthenticate',{ownerId:'switched',password})).status,409);
  const budget='/v1/tablesdb/nourishing/tables/login_limits/rows';
  remote.intercept({method:'POST',path:budget}).reply(201,{attempts:1},json).persist();
  remote.intercept({method:'GET',path:p=>p.startsWith(budget+'?')}).reply(200,{rows:[]},json).persist();
  const login={method:'POST',path:'/v1/account/sessions/email'};
  remote.intercept(login).reply(401,{code:401,type:'user_invalid_credentials',message:'private'},json);
  assert.equal((await post('reauthenticate',{ownerId,password:'wrong-password'})).status,401);
  const order=[];
  remote.intercept(login).reply(request=>{
   assert.deepEqual(JSON.parse(request.body),{email,password,duration:60});order.push('verify');
   return {statusCode:201,data:{$id:'temporary',userId:ownerId},responseOptions:json};
  });
  remote.intercept({method:'DELETE',path:'/v1/users/owner/sessions/temporary'}).reply(()=>{order.push('release');return {statusCode:204};});
  const result=await post('reauthenticate',{ownerId,password});assert.equal(result.status,200,await result.clone().text());assert.match(result.headers.get('cache-control'),/no-store/);
  const confirmation=await result.json();assert.deepEqual(Object.keys(confirmation).sort(),['ownerId','sessionContext']);assert.equal(confirmation.ownerId,ownerId);
  const change={kind:'email',email:'new@example.test',password,confirmedSession:confirmation.sessionContext};
  assert.equal((await post('update',change,'different-session')).status,409);
  remote.intercept({method:'PATCH',path:'/v1/account/email'}).reply(request=>{
   assert.deepEqual(JSON.parse(request.body),{email:change.email,password});order.push('update');
   return {statusCode:200,data:{...account,email:change.email,emailVerification:false},responseOptions:json};
  });
  const updated=await post('update',change);assert.equal(updated.status,200,await updated.clone().text());assert.equal((await updated.json()).account.email,change.email);
  assert.deepEqual(order,['verify','release','update']);assert.equal(lifecycle.operations.size,0);
 }finally{setGlobalDispatcher(previous);await mock.close();}
});
