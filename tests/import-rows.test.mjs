import test from 'node:test';
import assert from 'node:assert/strict';
import {importRows,batches,runBatches} from '../scripts/import-rows.mjs';
test('import resumes matching rows without overwriting or duplicating them',async()=>{
 const rows=[{$id:'a',payload:'old'},{$id:'b',payload:'new'}];let added;
 const db={listRows:async()=>({rows:[rows[0]]}),createRows:async({rows})=>{added=rows;return {rows};}};
 await importRows(db,'table',rows);assert.deepEqual(added,[rows[1]]);
});
test('import rejects a changed existing row and a truncated write response',async()=>{
 let wrote=false;await assert.rejects(()=>importRows({listRows:async()=>({rows:[{$id:'a',payload:'changed'}]}),createRows:async()=>{wrote=true;}},'table',[{$id:'a',payload:'source'}]),/differs/);assert.equal(wrote,false);
 await assert.rejects(()=>importRows({listRows:async()=>({rows:[]}),createRows:async()=>({rows:[]})},'table',[{$id:'b',payload:'source'}]),/count/);
});
test('batching preserves each row once and bounds count and payload',async()=>{
 const input=Array.from({length:205},(_,i)=>({$id:String(i),body:'x'.repeat(30000)})),out=[];
 for await(const batch of batches(input)){assert.ok(batch.length<=100);assert.ok(Buffer.byteLength(JSON.stringify(batch))<2.1*1024*1024);out.push(...batch);}
 assert.deepEqual(out,input);
});
test('parallel imports drain owned requests before reporting failure and bound active requests',async()=>{
 let active=0,peak=0,finished=0;
 await assert.rejects(()=>runBatches([1,2,3,4,5,6],async n=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,10));active--;finished++;if(n===2)throw Error('rejected');},3),/rejected/);
 assert.equal(active,0);assert.ok(peak<=3);assert.ok(finished>=3&&finished<6);
});
