import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebHandler} from '../server/http.mjs';
const origin='https://nourishing.example',cookie='__Host-nourishing_session=fixture';
const post=(body='{}',headers={},suffix='')=>new Request(origin+'/api/coach/answer'+suffix,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...headers},body});
function fixture(){const calls=[],service={current:async secret=>{calls.push(['auth',secret]);if(secret!=='fixture')throw Object.assign(Error('Sign in'),{code:401});},coachPreferences:async secret=>{calls.push(['preferences',secret]);return {preferencesRevision:'revision'};},coachAnswer:async(secret,input)=>{calls.push(['answer',secret,input]);return {mode:'recorded'};}};return {calls,handle:createWebHandler({config:{origin},service})};}
test('Coach preferences require a session, reject query parameters, and are never cached',async()=>{
 const {calls,handle}=fixture();assert.equal((await handle(new Request(origin+'/api/coach/preferences'))).status,401);assert.equal((await handle(new Request(origin+'/api/coach/preferences?ownerId=other',{headers:{Cookie:cookie}}))).status,400);assert.deepEqual(calls,[]);
 const response=await handle(new Request(origin+'/api/coach/preferences',{headers:{Cookie:cookie}}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(calls,[['preferences','fixture']]);
});
test('Coach answer authenticates before parsing and validates origin, body bounds, and fields',async()=>{
 const {calls,handle}=fixture();assert.equal((await handle(post('invalid',{Cookie:''}))).status,401);assert.deepEqual(calls,[]);assert.equal((await handle(post('invalid',{Cookie:'__Host-nourishing_session=other'}))).status,401);
 assert.equal((await handle(post('invalid',{},'?ownerId=other'))).status,400);assert.equal((await handle(post('{}',{Origin:'https://foreign.example'}))).status,403);assert.equal((await handle(post('{}',{'Content-Type':'text/plain'}))).status,415);assert.equal((await handle(post(' '.repeat(16385)))).status,413);assert.equal((await handle(post('{'))).status,400);
 const input={date:'2026-11-15',question:'Protein',preferencesRevision:'fixture'};assert.equal((await handle(post(JSON.stringify({...input,ownerId:'other'})))).status,400);assert.equal(calls.some(row=>row[0]==='answer'),false);
 const response=await handle(post(JSON.stringify(input)));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(calls.at(-1),['answer','fixture',input]);assert.deepEqual(await response.json(),{mode:'recorded'});
});
