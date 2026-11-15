import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {packWorkspace,unpackWorkspace} from '../server/data-codec.mjs';
import {parseHealthExportMetadata,readHealthExportState,installHealthExportMetadata,initializeHealthExportState,restoreHealthExportMetadata,readLegacyHealthExportMetadata,HEALTH_EXPORT_ROW_BYTES} from '../server/health-export-state.mjs';

const namespace='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const scope='33333333-3333-4333-8333-333333333333',nextScope='44444444-4444-4444-8444-444444444444';
const selection=()=>({kind:'nutrition',date:'2026-11-14',timeZone:'UTC',groups:[{anchorId:'a',entryIds:['a','b']}]});
const draft=()=>({kind:'nutrition',date:'2026-11-14',revision:1,selection:selection(),draftToken:'a'.repeat(64),updatedAt:'2026-11-14T12:00:00Z'});
const policy=()=>({namespace,kind:'nutrition',date:'2026-11-14',timeZone:'UTC',revision:2,groups:selection().groups,memberIds:['a','b','previous']});
const metadata=()=>({version:1,namespace,drafts:[draft()],policies:[policy()]});

test('migration preserves exact namespace and history and is idempotent in existing Appwrite rows',()=>{
 const state={profile:{name:'Unrelated'},entries:[{id:'existing'}]};const input=metadata();
 assert.deepEqual(installHealthExportMetadata(state,input,{saveScope:scope}),{changed:true});
 const before=structuredClone(state);assert.deepEqual(installHealthExportMetadata(state,input,{saveScope:nextScope}),{changed:false});assert.deepEqual(state,before);
 const packed=packWorkspace(state,'fixture-owner','fixture-generation');assert.deepEqual(unpackWorkspace(packed.head,packed.rows),state);
 input.policies[0].memberIds.push('outside');assert.deepEqual(state.healthIntakePolicies[0].memberIds,['a','b','previous']);
 assert.equal(readHealthExportState(state).namespace,namespace);assert.equal(state.healthExportState.saveScope,scope);
});

test('lineage and changed history conflicts leave the whole workspace intact',()=>{
 const state={entries:[]};installHealthExportMetadata(state,metadata(),{saveScope:scope});const before=structuredClone(state);
 for(const input of [{...metadata(),namespace:other},{...metadata(),drafts:[]},{...metadata(),policies:[]}]){
  assert.throws(()=>installHealthExportMetadata(state,input),{code:409});assert.deepEqual(state,before);
 }
 assert.throws(()=>restoreHealthExportMetadata(state,{...metadata(),namespace:other}),{code:409});assert.deepEqual(state,before);
});

test('ordinary initialization retains existing namespace and scope; partial metadata is never repaired silently',()=>{
 const state={};initializeHealthExportState(state,{namespace,saveScope:scope});const before=structuredClone(state);
 assert.deepEqual(initializeHealthExportState(state,{namespace:other,saveScope:nextScope}),{changed:false});assert.deepEqual(state,before);
 assert.throws(()=>initializeHealthExportState({healthIntakeDrafts:[]}),{code:400});
});

test('restore rotates review scope and keeps native membership when grouping is removed',()=>{
 const state={profile:{name:'Untouched'}};installHealthExportMetadata(state,metadata(),{saveScope:scope});
 const old=readHealthExportState(state);restoreHealthExportMetadata(state,{version:1,namespace,drafts:[],policies:[]},{saveScope:nextScope});
 assert.equal(state.healthExportState.namespace,namespace);assert.equal(state.healthExportState.saveScope,nextScope);assert.deepEqual(state.healthIntakeDrafts,[]);
 assert.deepEqual(state.healthIntakePolicies,[{...policy(),revision:3,groups:[],memberIds:['a','b','previous']}]);assert.equal(old.saveScope,scope);assert.equal(state.profile.name,'Untouched');
 const before=structuredClone(state);assert.throws(()=>restoreHealthExportMetadata(state,metadata(),{saveScope:nextScope}),{code:409});assert.deepEqual(state,before);
});

test('restore unions member history and preserves archived namespace grouping',()=>{
 const archived={...policy(),namespace:other,memberIds:['a','b']};const state={};installHealthExportMetadata(state,{...metadata(),policies:[policy(),archived]},{saveScope:scope});
 const incoming={...policy(),revision:1,groups:[{anchorId:'a',entryIds:['a','c']}],memberIds:['a','c']};
 restoreHealthExportMetadata(state,{...metadata(),policies:[incoming]},{saveScope:nextScope});
 assert.deepEqual(state.healthIntakePolicies[0].memberIds,['a','b','c','previous']);assert.equal(state.healthIntakePolicies[0].revision,3);
 assert.deepEqual(state.healthIntakePolicies[1],{...archived,revision:3});
});

test('malformed groups, duplicate ownership, missing members and record limits reject before mutation',()=>{
 const variants=[
  {...metadata(),extra:'authority'},
  {...metadata(),drafts:[draft(),draft()]},
  {...metadata(),policies:[policy(),{...policy(),date:'2026-11-15'}]},
  {...metadata(),policies:[{...policy(),memberIds:['a']}]},
  {...metadata(),drafts:[{...draft(),date:'2026-02-30'}]},
  {...metadata(),drafts:[{...draft(),selection:null}]},
  {...metadata(),policies:[{...policy(),revision:Number.MAX_SAFE_INTEGER+1}]}
 ];
 for(const input of variants){const state={entries:[]};assert.throws(()=>installHealthExportMetadata(state,input),{code:400});assert.deepEqual(state,{entries:[]});}
 assert.throws(()=>parseHealthExportMetadata({...metadata(),drafts:[{...draft(),updatedAt:'x'.repeat(HEALTH_EXPORT_ROW_BYTES)}]}),{code:413});
});

test('read-only extraction reads lineage and histories but never receipts or old save authority',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec('CREATE TABLE health_export_identity(id INTEGER,namespace TEXT); CREATE TABLE health_intake_drafts(kind TEXT,day TEXT,body TEXT); CREATE TABLE health_intake_policies(namespace TEXT,kind TEXT,day TEXT,body TEXT); CREATE TABLE review_save_receipts(secret TEXT);');
  db.prepare('INSERT INTO health_export_identity VALUES(1,?)').run(namespace);db.prepare('INSERT INTO health_intake_drafts VALUES(?,?,?)').run('nutrition','2026-11-14',JSON.stringify(draft()));db.prepare('INSERT INTO health_intake_policies VALUES(?,?,?,?)').run(namespace,'nutrition','2026-11-14',JSON.stringify(policy()));
  const queries=[];const reader={prepare(sql){assert.match(sql,/^SELECT /);queries.push(sql);return db.prepare(sql);}};
  assert.deepEqual(readLegacyHealthExportMetadata(reader),metadata());assert.ok(queries.every(sql=>!sql.includes('review_save')));
  db.prepare('UPDATE health_intake_policies SET day=?').run('2026-11-15');assert.throws(()=>readLegacyHealthExportMetadata(reader),{code:400});
 }finally{db.close();}
});

test('missing metadata is distinct from an invalid empty identity table',()=>{
 const db=new DatabaseSync(':memory:');try{assert.equal(readLegacyHealthExportMetadata(db),null);db.exec('CREATE TABLE health_export_identity(id INTEGER,namespace TEXT)');assert.throws(()=>readLegacyHealthExportMetadata(db),{code:400});}finally{db.close();}
});
