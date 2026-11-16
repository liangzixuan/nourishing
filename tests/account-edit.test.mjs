import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAccountEdit,editAccount} from '../server/account-edit.mjs';
import {createWebHandler} from '../server/http.mjs';
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
