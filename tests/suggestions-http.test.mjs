import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebHandler} from '../server/http.mjs';
const origin='https://candidate.example',cookie='__Host-nourishing_session=fixture';
const request=(payload,headers={cookie,origin},suffix='')=>new Request(origin+'/api/food-insights/ingredient-preview'+suffix,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(payload)});
test('ingredient preview requires session and same origin and passes only the authenticated request to its owner',async()=>{
 const calls=[],body={date:'2026-11-16',row:{ref:{kind:'library',id:'owned'},quantity:1,unit:'servings'}};
 const handle=createWebHandler({config:{origin},service:{current:async()=>({}),previewFoodInsightIngredient:async(secret,input)=>{calls.push({secret,input});return {row:input.row,nutrition:{totals:{protein:0}}};}}});
 assert.equal((await handle(request(body,{origin}))).status,401);assert.equal((await handle(request(body,{cookie,origin:'https://other.example'}))).status,403);assert.equal((await handle(request(body,undefined,'?owner=other'))).status,400);assert.equal(calls.length,0);
 const response=await handle(request(body));assert.equal(response.status,200);assert.deepEqual(calls,[{secret:'fixture',input:body}]);assert.equal((await response.json()).nutrition.totals.protein,0);
});
