import assert from 'node:assert/strict';

/** Actual SDK transport fixture for the request lifecycle gate; no application-method stubs. */
export function installLifecycleHttpMock(remote,{ownerId='fixture-owner'}={}){
 const json={headers:{'content-type':'application/json'}},gate={$id:ownerId,ownerId:ownerId,state:'active',jobId:'',version:0,$updatedAt:'2026-11-15T12:00:00.000Z'},operations=new Map(),labels=[];
 const respond=data=>({statusCode:200,data:JSON.stringify(data),responseOptions:json});
 remote.intercept({method:'GET',path:'/v1/tablesdb/nourishing/tables/account_lifecycle/rows/'+ownerId}).reply(()=>respond(gate)).persist();
 remote.intercept({method:'POST',path:'/v1/tablesdb/nourishing/tables/account_operations/rows'}).reply(options=>{
  const body=JSON.parse(options.body);
  assert.equal(body.data.ownerId,ownerId);
  assert.equal(body.data.state,'registering');
  assert.deepEqual(body.permissions,[]);
  assert.equal(body.transactionId,undefined);
  assert.ok(!operations.has(body.rowId));
  const row={$id:body.rowId,...body.data};
  operations.set(body.rowId,row);
  return respond(row);
 }).persist();
 remote.intercept({method:'GET',path:/^\/v1\/tablesdb\/nourishing\/tables\/account_operations\/rows\//}).reply(options=>{const row=operations.get(options.path.split('/').at(-1));assert.ok(row);return respond(row);}).persist();
 remote.intercept({method:'PATCH',path:/^\/v1\/tablesdb\/nourishing\/tables\/account_operations\/rows\//}).reply(options=>{const row=operations.get(options.path.split('/').at(-1)),body=JSON.parse(options.body);assert.ok(row);assert.equal(body.data.state,row.state==='registering'?'active':'settled');if(body.data.state==='active')labels.push(row.label);Object.assign(row,body.data);return respond(row);}).persist();
 remote.intercept({method:'DELETE',path:/^\/v1\/tablesdb\/nourishing\/tables\/account_operations\/rows\//}).reply(options=>{const id=options.path.split('/').at(-1);assert.equal(operations.get(id)?.state,'settled');operations.delete(id);return respond({});}).persist();
 return {gate,operations,labels};
}
