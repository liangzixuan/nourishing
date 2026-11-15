import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createWebHandler} from '../server/http.mjs';
import {initialState,act} from '../server/domain/workspace.mjs';
import {parseCommand,applyWorkspaceCommand} from '../server/workspace-commands.mjs';
import {libraryToolsView} from '../server/library-tools.mjs';
import {digest} from '../server/data-codec.mjs';

const origin='https://candidate.example',cookie='__Host-nourishing_session=fixture';
const request=(body,path='/api/library/command',headers={cookie,origin})=>new Request(origin+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
test('library commands authenticate before body access and retain strict route limits',async()=>{
 let calls=0;const handle=createWebHandler({config:{origin},service:{current:async()=>{throw {code:401};},workspaceCommand:async()=>{calls++;}}});
 for(const [headers,status]of [[{origin},401],[{cookie,origin:'https://other.example'},403],[{cookie,origin},401]]){
  const req=request({},undefined,headers);assert.equal((await handle({url:req.url,method:req.method,headers:req.headers,get body(){throw Error('Body read before authentication');}})).status,status);
 }assert.equal(calls,0);
 const authorized=createWebHandler({config:{origin},service:{current:async()=>({}),workspaceCommand:async()=>{calls++;return {};}}});
 assert.equal((await authorized(request({type:'food.save'}))).status,400);
 assert.equal((await authorized(request({type:'library.portions'},'/api/library/command?owner=other'))).status,400);
 const req=request({});assert.equal((await authorized({url:req.url,method:req.method,headers:req.headers,body:(async function*(){yield Buffer.alloc(4*1024*1024+1);})()})).status,413);assert.equal(calls,0);
});
test('production HTTP and command registry accept 1000 Unicode portions above 16 KiB and reject overflow atomically',async()=>{
 const state=initialState(),id=act(state,'food.save',{name:'Capacity fixture',grams:100,serving:'100 g',nutrients:{calories:100}}).id;
 const handle=createWebHandler({config:{origin},service:{current:async()=>({}),workspaceCommand:async(secret,input)=>{assert.equal(secret,'fixture');parseCommand(input);assert.equal(input.revision,digest(state));const result=applyWorkspaceCommand(state,{type:input.type,payload:input.payload});return {...result,revision:digest(state)};},libraryTools:async(_,input)=>libraryToolsView(state,input)}});
 const portions=Array.from({length:1000},(_,i)=>({id:'portion-'+i,label:'米'.repeat(500),grams:100}));
 const body=()=>({requestId:randomUUID(),revision:digest(state),type:'library.portions',payload:{kind:'food',id,portions}});
 assert.ok(Buffer.byteLength(JSON.stringify(body()))>16384);const response=await handle(request(body()));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(state.foods.at(-1).portions.length,1000);
 const before=digest(state);portions.push({id:'overflow',label:'Extra',grams:100});assert.equal((await handle(request(body()))).status,400);assert.equal(digest(state),before);
 assert.equal((await handle(request(body(),'/api/workspace/command'))).status,413);
 const get=path=>new Request(origin+path,{headers:{cookie}});
 const view=await handle(get('/api/library/tools?kind=food&id='+id));assert.equal(view.status,200);assert.equal((await view.json()).portions.length,1000);
 for(const query of ['kind=food&kind=recipe&id='+id,'kind=food&id='+id+'&owner=other','kind=food'])assert.equal((await handle(get('/api/library/tools?'+query))).status,400);
});
