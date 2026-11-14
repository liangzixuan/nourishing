import test from 'node:test';
import assert from 'node:assert/strict';
import {packWorkspace,unpackWorkspace,catalogRow,searchTerms,digest} from '../server/data-codec.mjs';
const state={version:1,profile:{name:'Example'},settings:{groups:['Lunch']},foods:[{id:'same:/食',nutrients:{calories:123.45,fiber:null},source:{original:'kept'}}],entries:[{id:'same:/食',date:'2026-11-14',foodId:'same:/食',amount:1}],notes:[],future:{value:false}};
test('workspace rows preserve all JSON facts, order, empty collections, unknowns, and opaque IDs',()=>{
 const packed=packWorkspace(state,'owner-a','import-a');
 assert.deepEqual(unpackWorkspace(packed.head,packed.rows),state);
 assert.equal(packed.head.digest,digest(state));
 assert.ok(packed.rows.every(row=>row.$id.length<=36&&!row.$id.includes('/')));
 assert.ok(packed.rows.every(row=>row.$permissions.length===1&&row.$permissions[0].includes('owner-a')));
 assert.notEqual(packed.rows[0].$id,packWorkspace(state,'owner-b','import-a').rows[0].$id);
});
test('restore rejects missing, duplicate, altered, foreign, and misordered record projections',()=>{
 const {head,rows}=packWorkspace(state,'owner-a','import-a');
 for(const bad of [rows.slice(1),[...rows,rows[0]],rows.map((r,i)=>i? r:{...r,payload:'null'}),rows.map((r,i)=>i?r:{...r,ownerId:'owner-b'}),rows.map((r,i)=>i?r:{...r,position:99})])assert.throws(()=>unpackWorkspace(head,bad));
 assert.throws(()=>packWorkspace({...state,foods:[state.foods[0],state.foods[0]]},'owner-a','import-a'),/Duplicate/);
});
test('catalog retains normalized, original, compact, and source identities independently',()=>{
 const input={id:'fdc:123',name:'Crème rice',search_text:'Crème rice USDA',priority:2,body:JSON.stringify({id:'fdc:123',name:'Crème rice',nutrients:{salt:null}}),original:'{"source": 12}',compact:'{"id":"fdc:123","name":"Crème rice"}'};
 const row=catalogRow(input,'catalog-a');
 assert.equal(row.original,input.original);assert.equal(row.payload,input.body);assert.equal(row.sourceId,input.id);
 assert.equal(row.searchText,' creme rice usda');assert.equal(row.digest,digest({...input}));
 assert.deepEqual(searchTerms('  CRÈME ri '),['creme','ri']);assert.deepEqual(searchTerms('!?'),[]);
});
