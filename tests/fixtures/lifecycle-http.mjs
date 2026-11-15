import assert from 'node:assert/strict';

/** Actual SDK transport fixture for the request lifecycle gate; no application-method stubs. */
export function installLifecycleHttpMock(remote,{ownerId='fixture-owner'}={}){
 const json={headers:{'content-type':'application/json'}},gate={$id:ownerId,ownerId:ownerId,state:'active',jobId:'',version:0,$updatedAt:'2026-11-15T12:00:00.000Z'},operations=new Map(),transactions=new Map(),labels=[];let transactionNumber=0;
 const respond=data=>({statusCode:200,data:JSON.stringify(data),responseOptions:json});
 remote.intercept({method:'GET',path:'/v1/tablesdb/nourishing/tables/account_lifecycle/rows/'+ownerId}).reply(()=>respond(gate)).persist();
 remote.intercept({method:'POST',path:'/v1/tablesdb/transactions'}).reply(options=>{assert.equal(JSON.parse(options.body).ttl,60);const $id='transaction-'+(++transactionNumber);transactions.set($id,[]);return respond({$id});}).persist();
 remote.intercept({method:'PATCH',path:/^\/v1\/tablesdb\/transactions\/transaction-/}).reply(options=>{const id=options.path.split('/').at(-1),body=JSON.parse(options.body),staged=transactions.get(id);assert.ok(staged);if(body.commit)for(const write of staged)write();transactions.delete(id);return respond({$id:id,status:body.commit?'committed':'rolledBack'});}).persist();
 remote.intercept({method:'PATCH',path:'/v1/tablesdb/nourishing/tables/account_lifecycle/rows/'+ownerId}).reply(options=>{const body=JSON.parse(options.body);assert.ok(transactions.has(body.transactionId));assert.equal(body.data.version,gate.version+1);transactions.get(body.transactionId).push(()=>Object.assign(gate,body.data));return respond({...gate,...body.data});}).persist();
 remote.intercept({method:'POST',path:'/v1/tablesdb/nourishing/tables/account_operations/rows'}).reply(options=>{const body=JSON.parse(options.body);assert.equal(body.data.ownerId,ownerId);assert.equal(body.data.state,'active');assert.deepEqual(body.permissions,[]);assert.ok(transactions.has(body.transactionId));labels.push(body.data.label);const row={$id:body.rowId,...body.data};transactions.get(body.transactionId).push(()=>operations.set(body.rowId,row));return respond(row);}).persist();
 remote.intercept({method:'GET',path:/^\/v1\/tablesdb\/nourishing\/tables\/account_operations\/rows\//}).reply(options=>{const row=operations.get(options.path.split('/').at(-1));assert.ok(row);return respond(row);}).persist();
 remote.intercept({method:'PATCH',path:/^\/v1\/tablesdb\/nourishing\/tables\/account_operations\/rows\//}).reply(options=>{const row=operations.get(options.path.split('/').at(-1)),body=JSON.parse(options.body);assert.ok(row);assert.equal(body.data.state,'settled');Object.assign(row,body.data);return respond(row);}).persist();
 remote.intercept({method:'DELETE',path:/^\/v1\/tablesdb\/nourishing\/tables\/account_operations\/rows\//}).reply(options=>{const id=options.path.split('/').at(-1);assert.equal(operations.get(id)?.state,'settled');operations.delete(id);return respond({});}).persist();
 return {gate,operations,transactions,labels};
}
