import test from 'node:test';
import assert from 'node:assert/strict';
import {remapWriteReferences,writeReceiptIdentities} from '../public/write-identities.js';

test('receipt identities reconcile each photo child and preserve user text',()=>{
 const identities=writeReceiptIdentities({command:{operationId:'local',type:'photo.log'}},{records:{entries:[{id:'rice'},{id:'greens'}]}});
 const pending={command:{payload:{id:'local-1',text:'local-1'}},transport:{body:{payload:{id:'local-1'}}},projection:{responses:{'/api/diary':{entries:[{id:'local-0',name:'local-0'}],entryIds:['local-0','local-1']}}}};
 remapWriteReferences(pending,identities);
 assert.equal(pending.command.payload.id,'greens');assert.equal(pending.transport.body.payload.id,'greens');
 assert.equal(pending.command.payload.text,'local-1');assert.equal(pending.projection.responses['/api/diary'].entries[0].name,'local-0');
 assert.deepEqual(pending.projection.responses['/api/diary'].entryIds,['rice','greens']);
});

test('edits never alias their own operation to the edited record',()=>{
 assert.deepEqual(writeReceiptIdentities({command:{operationId:'edit',type:'entry.update'}},{records:{entries:[{id:'food'}]}}),{});
 assert.deepEqual(writeReceiptIdentities({command:{operationId:'add',type:'water.add'}},{records:{biometrics:[{id:'water'}]}}),{add:'water'});
});
