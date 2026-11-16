import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createWebHandler} from '../server/http.mjs';
import {initialState,act} from '../server/domain/workspace.mjs';
import {previewLibraryEdit} from '../server/library-edit.mjs';
import {previewLibrary,parseCommand} from '../server/workspace-commands.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
const origin='https://candidate.example',cookie='__Host-nourishing_session=fixture',paths=['/api/library/preview','/api/library/edit-preview','/api/library/command'];
const post=(path,body={},headers={origin,cookie})=>new Request(origin+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
test('all editor POST routes authenticate before parsing 4 MiB bodies and reject query or wrong-origin requests',async()=>{
 let calls=0;const service={current:async()=>({}),previewLibrary:async()=>{calls++;return {};},previewLibraryEdit:async()=>{calls++;return {};},workspaceCommand:async()=>{calls++;return {};}},handle=createWebHandler({config:{origin},service});
 const unauthorized=createWebHandler({config:{origin},service:{current:async()=>{throw {code:401};}}});
 for(const path of paths){for(const headers of [{origin},{origin,cookie}]){const req=post(path,{},headers);assert.equal((await unauthorized({url:req.url,method:req.method,headers:req.headers,get body(){throw Error('Body read before auth');}})).status,401);}
 assert.equal((await handle(post(path+'?owner=other'))).status,400);assert.equal((await handle(post(path,{}, {origin:'https://other.example',cookie}))).status,403);
 const req=post(path);assert.equal((await handle({url:req.url,method:req.method,headers:req.headers,body:(async function*(){yield Buffer.alloc(4*1024*1024+1);})()})).status,413);
 }assert.equal(calls,0);
});
test('production route reviews and commits large recipe drafts, denies bypass and replays lost replies once',async()=>{
 const state=initialState(),food=act(state,'food.save',{name:'Grain',grams:100,nutrients:{calories:100}}).id,recipe=act(state,'recipe.save',{name:'Recipe',servings:1,ingredients:[{foodId:food,amount:1}]}).id,fixture=diaryStoreFixture(state),store=createWorkspaceStore(fixture.db,'fixture');
 const service={current:async()=>({}),previewLibrary:async(_,input)=>previewLibrary(fixture.state(),input),previewLibraryEdit:async(_,input)=>previewLibraryEdit(fixture.state(),input,{owner:'fixture'}),workspaceCommand:async(_,input)=>{parseCommand(input);return store.command(input,async()=>null);}},handle=createWebHandler({config:{origin},service});
 const draft={id:recipe,instructions:'Cook gently. '.repeat(3000)},reviewResponse=await handle(post(paths[1],{kind:'recipe',draft}));assert.equal(reviewResponse.status,200);const review=await reviewResponse.json();assert.equal(review.id,recipe);assert.equal(review.hasUses,false);
 const preview=await handle(post(paths[0],{kind:'recipe',draft,date:'2026-11-16',quantity:{amount:1}}));assert.equal(preview.status,200);assert.equal((await preview.json()).recipe.quantity.grams,100);
 const command={requestId:randomUUID(),revision:review.revision,type:'library.edit',payload:{kind:'recipe',draft,reviewToken:review.reviewToken,mode:'preserve',confirmed:true}};
 fixture.lose();const response=await handle(post(paths[2],command));assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.item.kind,'recipe');assert.notEqual(saved.item.id,recipe);assert.deepEqual(await (await handle(post(paths[2],command))).json(),saved);assert.equal(fixture.state().recipes.length,2);
 const before=fixture.state();const bypass=await handle(post(paths[2],{...command,requestId:randomUUID(),revision:saved.revision,type:'recipe.save',payload:draft}));assert.equal(bypass.status,400);assert.deepEqual(fixture.state(),before);
 for(const [type,payload]of [['food.save',{name:'New food',grams:100,nutrients:{calories:10}}],['recipe.save',{name:'New recipe',servings:1,ingredients:[{foodId:food,amount:1}]}],['meal.save',{name:'New meal',items:[{foodId:food,amount:1}]}]]){const revision=(await service.previewLibraryEdit(null,{kind:'recipe',draft:{id:recipe}})).revision;const created=await handle(post(paths[2],{requestId:randomUUID(),revision,type,payload}));assert.equal(created.status,200);assert.equal((await created.json()).item.kind,type.split('.')[0]);}
});
