import webPush from 'web-push';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createWebPushStore} from '../server/web-push-store.mjs';
import {parsePushSubscription,parseVapid,createWebPushTransport} from '../server/web-push.mjs';

const origin='https://nourishing.example',owner='push-owner';
const pair=webPush.generateVAPIDKeys;
const vapid=pair(),subscription=(id='device')=>({endpoint:'https://fcm.googleapis.com/fcm/send/'+id,expirationTime:null,keys:{p256dh:pair().publicKey,auth:randomBytes(16).toString('base64url')}});
function fixture({send=async()=>({statusCode:201})}={}){
 const tables=new Map(),transactions=new Map();let clock=Date.parse('2026-11-15T14:00:00Z'),lost=false,failReceipt=false;
 const table=name=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name);};
 function apply(operation,input){const rows=table(input.tableId),old=rows.get(input.rowId);if(operation==='delete'){rows.delete(input.rowId);return;}if(operation==='create'&&old)throw {code:409};if(operation==='update'&&!old)throw {code:404};rows.set(input.rowId,{...old,...structuredClone(input.data),$id:input.rowId,...(input.permissions?{$permissions:input.permissions}:{})});}
 const db={
  async getRow({tableId,rowId}){const value=table(tableId).get(rowId);if(!value)throw {code:404};return structuredClone(value);},
  async listRows({tableId,queries=[]}){let rows=[...table(tableId).values()],offset=0,limit=100;const parsed=queries.map(q=>JSON.parse(q));for(const q of parsed){if(q.method==='equal')rows=rows.filter(row=>q.values.includes(row[q.attribute]));if(q.method==='lessThan')rows=rows.filter(row=>row[q.attribute]<q.values[0]);if(q.method==='offset')offset=q.values[0];if(q.method==='limit')limit=q.values[0];}for(const q of parsed.filter(q=>['orderAsc','orderDesc'].includes(q.method)).reverse())rows.sort((a,b)=>String(a[q.attribute]).localeCompare(String(b[q.attribute]))*(q.method==='orderDesc'?-1:1));return {rows:structuredClone(rows.slice(offset,offset+limit))};},
  async deleteRow(input){if(input.transactionId)transactions.get(input.transactionId).push(['delete',input]);else apply('delete',input);},
  async createTransaction(){const $id=randomUUID();transactions.set($id,[]);return {$id};},
  async createRow(input){if(input.transactionId)transactions.get(input.transactionId).push(['create',input]);else apply('create',input);},
  async updateRow(input){if(input.tableId==='push_deliveries'&&failReceipt){failReceipt=false;throw Error('Lost receipt update');}if(input.transactionId)transactions.get(input.transactionId).push(['update',input]);else apply('update',input);},
  async updateTransaction({transactionId,commit}){const operations=transactions.get(transactionId);transactions.delete(transactionId);if(!commit)return;for(const [op,input]of operations)if(op==='create'&&table(input.tableId).has(input.rowId))throw {code:409};for(const [op,input]of operations)apply(op,input);if(lost){lost=false;throw Error('Lost commit reply');}}
 };
 const options={db,ownerId:owner,origin,vapid,now:()=>clock,send},store=createWebPushStore(options);
 return {db,store,options,table,advance(){clock+=60001;},lose(){lost=true;},failReceipt(){failReceipt=true;}};
}

test('subscription validation accepts browser P-256 keys and rejects arbitrary endpoints, keys and mismatched VAPID',()=>{
 const source=subscription();assert.deepEqual(parsePushSubscription(source),source);
 for(const endpoint of ['http://fcm.googleapis.com/send/x','https://127.0.0.1/x','https://fcm.googleapis.com.evil.example/x','https://x@fcm.googleapis.com/x','https://web.push.apple.com/x#secret','https://fcm.googleapis.com:8443/x'])assert.throws(()=>parsePushSubscription({...source,endpoint}),{code:400});
 assert.throws(()=>parsePushSubscription({...source,keys:{...source.keys,p256dh:Buffer.alloc(65).toString('base64url')}}),{code:400});
 assert.throws(()=>parsePushSubscription({...source,keys:{...source.keys,auth:'bad'}}),{code:400});
 assert.throws(()=>parseVapid({...vapid,privateKey:pair().privateKey},origin),{code:503});
 assert.equal(parseVapid(vapid,origin).subject,origin);
});

test('status and connect stay paused; only public device metadata and public VAPID key leave the server',async()=>{
 let sends=0;const f=fixture({send:async()=>{sends++;return {statusCode:201};}});
 assert.deepEqual((await f.store.status()).devices,[]);assert.equal(f.table('push_accounts').size,0);
 const source=subscription(),connected=await f.store.subscribe({subscription:source,label:'Pixel'});
 assert.equal(connected.paused,true);assert.equal(sends,0);assert.equal(connected.devices.length,1);assert.equal(connected.publicKey,vapid.publicKey);
 assert.ok(!JSON.stringify(connected).includes(source.endpoint));assert.ok(!JSON.stringify(connected).includes(source.keys.auth));assert.ok(!JSON.stringify(connected).includes(vapid.privateKey));
 await f.store.subscribe({subscription:source,label:'My Pixel'});assert.equal((await f.store.status()).devices.length,1);
 const foreign=createWebPushStore({...f.options,ownerId:'another-owner'});assert.equal((await foreign.status()).devices.length,0);
 await assert.rejects(()=>foreign.test({deviceId:connected.deviceId,requestId:randomUUID()}),{code:404});
 await assert.rejects(()=>foreign.test({endpoint:source.endpoint,requestId:randomUUID()}),{code:404});
 await assert.rejects(()=>f.store.test({deviceId:connected.deviceId,endpoint:source.endpoint,requestId:randomUUID()}),{code:400});
 const requestId=randomUUID();
 assert.equal((await f.store.test({endpoint:source.endpoint,requestId})).outcome,'accepted');
 assert.equal((await f.store.test({deviceId:connected.deviceId,requestId})).outcome,'accepted');
 assert.equal(sends,1);
 await f.store.unsubscribe({endpoint:source.endpoint});assert.equal((await f.store.status()).devices.length,0);
});

test('one explicit test creates a durable receipt, rate limits new attempts, and never replays the send',async()=>{
 const sent=[],f=fixture({send:async(...args)=>{sent.push(args);return {statusCode:201};}}),connected=await f.store.subscribe({subscription:subscription(),label:'Pixel'}),input={deviceId:connected.deviceId,requestId:randomUUID()};
 assert.deepEqual(await f.store.test(input),{outcome:'accepted',statusCode:201});assert.deepEqual(await f.store.test(input),{outcome:'accepted',statusCode:201});assert.equal(sent.length,1);
 assert.deepEqual(Object.keys(JSON.parse(sent[0][1])).sort(),['language','tag','version']);assert.equal(sent[0][2].TTL,300);assert.equal(sent[0][2].vapidDetails.privateKey,vapid.privateKey);
 await assert.rejects(()=>f.store.test({...input,requestId:randomUUID()}),{code:429});f.advance();await f.store.test({...input,requestId:randomUUID()});assert.equal(sent.length,2);
 await assert.rejects(()=>f.store.test({...input,deviceId:'a'.repeat(36)}),{code:409});
 assert.equal((await f.store.status()).paused,true);
});

test('lost claim reply, transport failure and lost result update retain uncertainty without another send',async()=>{
 let sends=0;const f=fixture({send:async()=>{sends++;throw Error('Transport timeout');}}),connected=await f.store.subscribe({subscription:subscription(),label:'Pixel'});
 const first={deviceId:connected.deviceId,requestId:randomUUID()};f.lose();assert.deepEqual(await f.store.test(first),{outcome:'unknown',statusCode:null});assert.equal(sends,0);await f.store.test(first);assert.equal(sends,0);
 f.advance();const second={...first,requestId:randomUUID()};assert.deepEqual(await f.store.test(second),{outcome:'unknown',statusCode:null});await f.store.test(second);assert.equal(sends,1);
 const g=fixture({send:async()=>{sends++;return {statusCode:201};}}),next=await g.store.subscribe({subscription:subscription(),label:'Pixel'}),input={deviceId:next.deviceId,requestId:randomUUID()};g.failReceipt();await assert.rejects(()=>g.store.test(input),/Lost receipt update/);assert.deepEqual(await g.store.test(input),{outcome:'unknown',statusCode:null});assert.equal(sends,2);
});

test('expired subscription is removed but a replacement made while sending survives',async()=>{
 const f=fixture({send:async()=>({statusCode:410})}),source=subscription(),connected=await f.store.subscribe({subscription:source,label:'Pixel'});
 assert.equal((await f.store.test({deviceId:connected.deviceId,requestId:randomUUID()})).outcome,'expired');assert.equal((await f.store.status()).devices.length,0);
 let g;g=fixture({send:async()=>{await g.store.subscribe({subscription:{...source,keys:subscription().keys},label:'Reconnected'});return {statusCode:410};}});
 const next=await g.store.subscribe({subscription:source,label:'Pixel'});await g.store.test({deviceId:next.deviceId,requestId:randomUUID()});assert.equal((await g.store.status()).devices[0].label,'Reconnected');
});

test('source device limit is eight and missing configuration does not connect or send',async()=>{
 const f=fixture();for(let i=0;i<8;i++)await f.store.subscribe({subscription:subscription(String(i)),label:'Browser '+i});
 await assert.rejects(()=>f.store.subscribe({subscription:subscription('nine'),label:'Nine'}),{code:400});
 const missing=createWebPushStore({...f.options,vapid:null});assert.equal((await missing.status()).configured,false);await assert.rejects(()=>missing.subscribe({subscription:subscription(),label:'Pixel'}),{code:503});
});

test('Web Push transport encrypts a real protocol request, forbids redirects and cancels response body',async()=>{
 let captured,cancelled=false;const send=createWebPushTransport({fetchImpl:async(...args)=>{captured=args;return {status:201,body:{cancel:async()=>{cancelled=true;}}};}}),source=subscription();
 const result=await send(source,JSON.stringify({version:1,tag:'synthetic'}),{TTL:300,urgency:'normal',contentEncoding:'aes128gcm',vapidDetails:parseVapid(vapid,origin),signal:AbortSignal.timeout(10000)});
 assert.equal(result.statusCode,201);assert.equal(captured[0],source.endpoint);assert.equal(captured[1].redirect,'error');assert.equal(captured[1].method,'POST');assert.equal(captured[1].headers['Content-Encoding'],'aes128gcm');assert.equal(Buffer.from(captured[1].body).includes(Buffer.from('synthetic')),false);assert.equal(cancelled,true);
});
