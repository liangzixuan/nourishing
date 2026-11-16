import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebHandler} from '../server/http.mjs';
const origin='https://nourishing.example',cookie='__Host-nourishing_session=fixture';
test('Display and exercise catalog reads require a session and reject caller-selected parameters',async()=>{
 const calls=[],service={display:async secret=>{calls.push(['display',secret]);return {revision:'fixture',settings:{theme:'dark'}};},exerciseCatalog:async secret=>{calls.push(['catalog',secret]);return {items:[],headings:[]};}},handler=createWebHandler({config:{origin},service});
 for(const path of ['/api/display','/api/records/exercise-catalog']){
  assert.equal((await handler(new Request(origin+path))).status,401);
  for(const suffix of ['?owner=other','?date=2026-11-16','?q=walking','?q=a&q=b'])assert.equal((await handler(new Request(origin+path+suffix,{headers:{cookie}}))).status,400);
  const response=await handler(new Request(origin+path,{headers:{cookie}}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 }
 assert.deepEqual(calls,[['display','fixture'],['catalog','fixture']]);
});
