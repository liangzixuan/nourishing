import test from 'node:test';import assert from 'node:assert/strict';
import {withinAccountOperation,trackRemoteCall} from '../server/account-operation-context.mjs';
test('read failures and definitive write rejection settle, uncertain mutations retain ownership',async()=>{
 for(const [method,code,uncertain]of [['get',503,false],['post',400,false],['patch',409,false],['delete',404,false],['post',503,true],['patch',undefined,true],['put',408,true]]){
 const operation={uncertain:false,markUncertain(){this.uncertain=true;}};await assert.rejects(withinAccountOperation(operation,()=>trackRemoteCall(method,async()=>{throw Object.assign(Error('fixture'),{code});})));assert.equal(operation.uncertain,uncertain,method+code);
 }
});
test('operation context is isolated across concurrent accounts and recovered mutations may complete',async()=>{
 const a={uncertain:false,markUncertain(){this.uncertain=true;}},b={...a};
 await Promise.all([withinAccountOperation(a,async()=>{await trackRemoteCall('post',async()=>{throw {code:503};}).catch(()=>{});assert.equal(await trackRemoteCall('get',async()=>'verified-receipt'),'verified-receipt');}),withinAccountOperation(b,()=>trackRemoteCall('post',async()=>({ok:true})))]);assert.equal(a.uncertain,true);assert.equal(b.uncertain,false);
});
