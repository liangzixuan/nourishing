import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initialState,act} from '../server/domain/workspace.mjs';
import {digest,rowId,unpackWorkspace} from '../server/data-codec.mjs';
import {prepareCsvImport,validateCsvInput} from '../server/csv-import.mjs';
import {createCsvImportStore} from '../server/csv-import-store.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';

const owner='csv-fixture',secret='csv-fixture-signing-key-'.repeat(3),now=Date.parse('2026-11-15T12:00:00Z');
const biometrics={kind:'biometrics',text:'date,type,value,unit,time\n2026-11-14,Weight,70,kg,08:00'};
function fixture(state=initialState()){
 const f=diaryStoreFixture(state,owner),sizes=[];let writes=0,failAt=0,commitOperations=0;
 f.db.createRows=async({tableId,rows})=>{
  sizes.push(rows.length);if(++writes===failAt)throw Error('Staging interrupted');
  const table=f.table(tableId);for(const row of rows){if(table.has(row.$id))throw {code:409};table.set(row.$id,structuredClone(row));}return {rows:structuredClone(rows)};
 };
 for(const name of ['createRow','updateRow']){const operation=f.db[name];f.db[name]=async input=>{commitOperations++;return operation(input);};}
 const store=createCsvImportStore({db:f.db,ownerId:owner,reviewSecret:secret,now:()=>now});
 return {...f,store,sizes,failStaging(){failAt=writes+2;},operations:()=>commitOperations};
}
async function reviewed(f,input=biometrics){const preview=await f.store.preview(input);return {...input,revision:preview.revision,reviewToken:preview.reviewToken,requestId:randomUUID()};}

test('CSV types append records, preserve original rows, and reject a whole invalid file',()=>{
 const state=initialState();act(state,'food.save',{name:'Existing',grams:100,serving:'100 g',nutrients:{calories:100}});const before=structuredClone(state);
 const food=prepareCsvImport(state,{kind:'foods',text:'name,grams,calories,protein\nNew food,100,200,12'});
 assert.equal(food.count,1);assert.equal(food.state.foods.length,2);assert.deepEqual(food.state.foods[0],state.foods[0]);assert.deepEqual(state,before);
 const diary=prepareCsvImport(state,{kind:'diary',text:'date,name,amount,group,time\n2026-11-14,Existing,2,Lunch,12:00'});
 assert.equal(diary.state.entries[0].foodId,state.foods[0].id);assert.equal(diary.state.entries[0].amount,2);
 assert.throws(()=>prepareCsvImport(state,{kind:'biometrics',text:biometrics.text+'\n2026-11-14,Weight,bad,kg,09:00'}),/Row 3/);assert.deepEqual(state,before);
 assert.throws(()=>prepareCsvImport(state,{kind:'foods',text:'name,grams\n'}),/no records/);
 assert.throws(()=>validateCsvInput({kind:'other',text:'date\n'}),{code:400});
 assert.throws(()=>validateCsvInput({...biometrics,ownerId:'someone'}),{code:400});
});

test('preview has no writes; import atomically retains history and replays its durable receipt',async()=>{
 const state=initialState();state.healthSync={historical:'preserve this source metadata'};
 const f=fixture(state),oldHead=structuredClone(f.table('workspace_heads').get(owner));
 const input=await reviewed(f);assert.equal(f.sizes.length,0);assert.equal(f.operations(),0);assert.deepEqual(f.state(),state);
 f.lose();const result=await f.store.import(input);assert.equal(result.count,1);assert.equal(f.state().biometrics.length,1);assert.deepEqual(f.state().healthSync,state.healthSync);
 const writes=f.sizes.length;assert.deepEqual(await f.store.import(input),result);assert.equal(f.sizes.length,writes);assert.equal(f.state().biometrics.length,1);
 const recovery=f.table('workspace_recoveries').get(rowId(owner,oldHead.generation));assert.equal(JSON.parse(recovery.head).digest,oldHead.digest);
 assert.deepEqual(unpackWorkspace(oldHead,[...f.table('workspace_records').values()].filter(row=>row.generation===oldHead.generation)),state);
 assert.equal(f.operations(),4);assert.equal(f.table('command_receipts').size,1);
});

test('staging uses bounded batches and a failed batch cannot expose partial imported records',async()=>{
 const f=fixture(),input=await reviewed(f,{kind:'biometrics',text:'date,type,value,unit\n'+Array.from({length:230},()=> '2026-11-14,Weight,70,kg').join('\n')});
 f.failStaging();await assert.rejects(()=>f.store.import(input),/Staging interrupted/);assert.equal(f.state().biometrics.length,0);assert.equal(f.table('command_receipts').size,0);
 const result=await f.store.import(input);assert.equal(result.count,230);assert.equal(f.state().biometrics.length,230);assert.ok(f.sizes.every(size=>size<=100));assert.equal(f.operations(),4);
});

test('failed final commit leaves the old workspace current; retry imports once',async()=>{
 const f=fixture(),input=await reviewed(f),before=structuredClone(f.state());f.fail();
 await assert.rejects(()=>f.store.import(input),/commit failed/);assert.deepEqual(f.state(),before);assert.equal(f.table('workspace_recoveries').size,0);assert.equal(f.table('command_receipts').size,0);
 await f.store.import(input);assert.equal(f.state().biometrics.length,1);
});

test('reviews bind owner, file, kind and revision, and do not permit expired or changed saves',async()=>{
 const f=fixture(),input=await reviewed(f);
 await assert.rejects(()=>f.store.import({...input,text:input.text.replace(',70,',',71,')}),{code:409});
 await assert.rejects(()=>f.store.import({...input,kind:'diary'}),{code:409});
 const foreign=createCsvImportStore({db:f.db,ownerId:'other',reviewSecret:secret,now:()=>now});await assert.rejects(()=>foreign.import(input),{code:409});
 const expired=createCsvImportStore({db:f.db,ownerId:owner,reviewSecret:secret,now:()=>now+1800001});await assert.rejects(()=>expired.import(input),{code:409});
 f.table('workspace_heads').get(owner).digest='f'.repeat(64);await assert.rejects(()=>f.store.import(input));assert.equal(f.table('command_receipts').size,0);
});

test('concurrent edit after staging rejects the swap without replacing the edited head',async()=>{
 const f=fixture(),input=await reviewed(f),original=f.db.createRows;let changed=false;
 f.db.createRows=async args=>{const result=await original(args);if(!changed){changed=true;f.table('workspace_heads').get(owner).$updatedAt='concurrent-change';}return result;};
 await assert.rejects(()=>f.store.import(input),{code:409});assert.equal(f.state().biometrics.length,0);assert.equal(f.table('command_receipts').size,0);assert.equal(f.table('workspace_heads').get(owner).$updatedAt,'concurrent-change');
});

test('existing photos keep immutable file references in the new generation',async()=>{
 const state=initialState(),photo='a'.repeat(64);state.notes.push({id:'note',date:'2026-11-14',text:'Photo note',imageId:photo});
 const f=fixture(state),head=f.table('workspace_heads').get(owner),id=rowId(owner,head.generation,'note_photos',photo);
 const row={$id:id,$permissions:[`read("user:${owner}")`],ownerId:owner,generation:head.generation,namespace:'note_photos',sourceId:photo,fileId:rowId(owner,'note_photos',photo),digest:photo,bytes:100,width:20,height:20};f.table('workspace_media').set(id,row);
 await f.store.import(await reviewed(f));const current=f.table('workspace_heads').get(owner),copy=f.table('workspace_media').get(rowId(owner,current.generation,'note_photos',photo));
 assert.equal(copy.fileId,row.fileId);assert.deepEqual(copy.$permissions,row.$permissions);assert.equal(f.state().notes[0].imageId,photo);assert.ok(f.table('workspace_media').has(id));
});
