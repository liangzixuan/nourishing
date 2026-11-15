import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmAccountPassword} from '../server/account-password.mjs';
const account={$id:'owner',email:'owner@example.test'};
test('fresh account password verification uses current identity, short session and removes its temporary session',async()=>{
 const calls=[];
 await confirmAccountPassword({account,password:'fixture-password',budget:async email=>calls.push(['budget',email]),auth:{async createEmailPasswordSession(input){calls.push(['login',input]);return {$id:'fresh',userId:'owner'};}},users:{async deleteSession(input){calls.push(['remove',input]);}}});
 assert.deepEqual(calls,[['budget',account.email],['login',{email:account.email,password:'fixture-password',duration:60}],['remove',{userId:'owner',sessionId:'fresh'}]]);
});
test('wrong password or mismatched authenticated identity cannot authorize deletion',async()=>{
 let removed=false;
 await assert.rejects(confirmAccountPassword({account,password:'wrong-pass',budget:async()=>{},auth:{async createEmailPasswordSession(){throw Object.assign(Error('denied'),{code:401});}},users:{async deleteSession(){removed=true;}}}),{code:401});assert.equal(removed,false);
 await assert.rejects(confirmAccountPassword({account,password:'fixture-pass',budget:async()=>{},auth:{async createEmailPasswordSession(){return {$id:'fresh',userId:'different'};}},users:{async deleteSession(input){assert.deepEqual(input,{userId:'different',sessionId:'fresh'});removed=true;}}}),{code:403});assert.equal(removed,true);
});
test('unconfirmed temporary-session cleanup or invalid passwords cannot authorize deletion',async()=>{
 let calls=0;const deps={account,budget:async()=>{},auth:{async createEmailPasswordSession(){calls++;return {$id:'fresh',userId:'owner'};}},users:{async deleteSession(){throw Object.assign(Error('network'),{code:503});}}};
 await assert.rejects(confirmAccountPassword({...deps,password:'fixture-password'}),{code:503});
 for(const password of ['',null,'short','x'.repeat(257)])await assert.rejects(confirmAccountPassword({...deps,password}),{code:400});assert.equal(calls,1);
});
