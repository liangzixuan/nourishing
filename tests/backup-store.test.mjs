import test from 'node:test';
import assert from 'node:assert/strict';
import {packWorkspace} from '../server/data-codec.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {stageBackupRows,createBackupStore} from '../server/backup-store.mjs';

test('backup staging batches create-only rows and retries without overwriting different facts',async()=>{
 const state=initialState();state.notes=Array.from({length:230},(_,index)=>({id:String(index),date:'2026-11-14',text:'Synthetic '+index}));
 const rows=packWorkspace(state,'synthetic-owner','synthetic-generation').rows,stored=new Map(),sizes=[];
 const db={async listRows({queries}){const ids=JSON.parse(queries[0]).values;return {rows:ids.filter(id=>stored.has(id)).map(id=>structuredClone(stored.get(id)))};},async createRows({rows}){sizes.push(rows.length);for(const row of rows){assert.equal(stored.has(row.$id),false);stored.set(row.$id,structuredClone(row));}return {rows};}};
 await stageBackupRows(db,rows);assert.equal(stored.size,rows.length);assert.ok(sizes.length>=3);assert.ok(sizes.every(count=>count<=100));
 const writes=sizes.length;await stageBackupRows(db,rows);assert.equal(sizes.length,writes);
 const changed=structuredClone(rows);changed[0].payload='changed';await assert.rejects(()=>stageBackupRows(db,changed),{code:409});assert.equal(stored.get(rows[0].$id).payload,rows[0].payload);
});

test('backup staging observes a concurrent identical create, but rejects incomplete conflict results',async()=>{
 const rows=packWorkspace(initialState(),'synthetic-owner','synthetic-generation').rows;let calls=0;
 const db={async listRows(){return {rows:calls++?rows:[]};},async createRows(){throw Object.assign(Error('Concurrent creation'),{code:409});}};
 await stageBackupRows(db,rows);
 await assert.rejects(()=>stageBackupRows({...db,listRows:async()=>({rows:[]})},rows),{code:409});
});

test('backup store needs an authenticated owner and rejects restore fields before database work',async()=>{
 assert.throws(()=>createBackupStore({}),{code:401});
 const store=createBackupStore({ownerId:'synthetic-owner'});
 await assert.rejects(()=>store.restore({requestId:'wrong',reviewToken:'a'.repeat(64),confirmation:'replace'}),{code:400});
 await assert.rejects(()=>store.upload({reviewToken:'a'.repeat(64),namespace:'note_photos',photo:{},ownerId:'other'}),{code:400});
});
