import test from 'node:test';
import assert from 'node:assert/strict';
import {MockAgent,getGlobalDispatcher,setGlobalDispatcher} from 'undici';
import {createAppwriteService} from '../server/appwrite-service.mjs';
import {createWebHandler} from '../server/http.mjs';
import {initialState,act} from '../server/domain/workspace.mjs';
import {packWorkspace} from '../server/data-codec.mjs';
import {installLifecycleHttpMock} from './fixtures/lifecycle-http.mjs';

test('Charts HTTP service adapts the captured account calendar for source projections',async()=>{
 const owner='fixture-owner',state=initialState();act(state,'chart.save',{version:2,name:'Weight history',primary:{kind:'biometric',type:'weight',unit:'kg'},secondary:null,days:2,visible:true});
 const packed=packWorkspace(state,owner,'fixture-generation'),previous=getGlobalDispatcher(),mock=new MockAgent();mock.disableNetConnect();setGlobalDispatcher(mock);
 const remote=mock.get('https://appwrite.fixture.invalid'),json={headers:{'content-type':'application/json'}};
 remote.intercept({method:'GET',path:'/v1/account'}).reply(200,{$id:owner,email:'fixture@example.com',emailVerification:true},json).persist();
 remote.intercept({method:'GET',path:'/v1/tablesdb/nourishing/tables/profiles/rows/'+owner}).reply(200,{timeZone:'America/Chicago',units:'metric'},json).persist();
 remote.intercept({method:'GET',path:'/v1/tablesdb/nourishing/tables/workspace_heads/rows/'+owner}).reply(200,{$id:owner,...packed.head},json).persist();
 remote.intercept({method:'GET',path:/^\/v1\/tablesdb\/nourishing\/tables\/workspace_records\/rows\?/}).reply(200,{rows:packed.rows,total:packed.rows.length},json).persist();
 const {operations,labels}=installLifecycleHttpMock(remote);
 try {
  const config={origin:'https://nourishing.example',endpoint:'https://appwrite.fixture.invalid/v1',project:'fixture',database:'nourishing',profileTable:'profiles'},handler=createWebHandler({config,service:createAppwriteService(config,'fixture-key')});
  const response=await handler(new Request(config.origin+'/api/charts?to=2026-11-15',{headers:{Cookie:'__Host-nourishing_session=fixture-session'}}));
  assert.equal(response.status,200,await response.clone().text());const view=await response.json();
  assert.equal(view.calendar.timeZone,'America/Chicago');assert.ok(Number.isFinite(Date.parse(view.calendar.asOf)));assert.equal(view.cards.find(card=>card.kind==='custom').name,'Weight history');
  assert.equal(response.headers.get('cache-control'),'no-store');for(const endpoint of ['glucose-timeline','cycle']){const response=await handler(new Request(config.origin+'/api/'+endpoint+'?from=2026-11-01&to=2026-11-15',{headers:{Cookie:'__Host-nourishing_session=fixture-session'}}));assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).view.calendar.timeZone,'America/Chicago');}assert.deepEqual(labels,['charts','glucoseTimeline','cycleView']);assert.equal(operations.size,0);
 }finally{setGlobalDispatcher(previous);await mock.close();}
});
