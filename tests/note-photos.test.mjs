import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {digest,unpackWorkspace,rowId} from '../server/data-codec.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {stagePhotoMedia} from '../server/photo-storage.mjs';
import {initialState,act} from '../server/domain/workspace.mjs';
import {readDiaryRecordCorrection} from '../server/domain/diary-record-correction.mjs';
import {validateStoredPhoto} from '../server/domain/photo-images.mjs';
import {prepareNotePhoto,applyNotePhotoCommand,validateNotePhotoAction} from '../server/note-photos.mjs';
const date='2026-11-15',fields={date,time:'12:00',text:'A note',group:null};
const dataUrl='data:image/png;base64,'+(await sharp({create:{width:30,height:45,channels:3,background:'#739985'}}).png().toBuffer()).toString('base64');
const prepared=await prepareNotePhoto({dataUrl}),photo=await validateStoredPhoto(prepared.photo);
const action=(state,changes={},image={mode:'keep'})=>({type:'note.photo.save',payload:{id:state.notes[0]?.id??null,recordRevision:state.notes[0]?readDiaryRecordCorrection(state,{collection:'notes',id:state.notes[0].id}).revision:null,fields:{...fields,...changes},photo:image}});

test('note photo preparation uses source normalization without saving image metadata',async()=>{
 assert.match(prepared.photo.dataUrl,/^data:image\/jpeg;base64,/);assert.equal(prepared.photo.id,photo.id);
 const metadata=await sharp(photo.bytes).metadata();assert.equal(metadata.exif,undefined);assert.equal(metadata.xmp,undefined);
 await assert.rejects(prepareNotePhoto({dataUrl,ownerId:'other'}),{code:400});
 await assert.rejects(prepareNotePhoto({dataUrl:'data:text/plain;base64,eA=='}),{code:400});
});
test('create, keep, replace and remove preserve original note identity and source facts',()=>{
 const state=initialState();const result=applyNotePhotoCommand(state,action(state,{}, {mode:'replace',id:photo.id}),{photo});
 assert.equal(result.result.kind,'note');assert.equal(state.notes[0].imageId,photo.id);
 const row=state.notes[0];row.source={provider:'fixture',opaque:'original evidence'};row.originalText='Captured fact';const id=row.id;
 applyNotePhotoCommand(state,action(state,{text:'Edited',group:'Lunch'}));
 assert.equal(state.notes[0].id,id);assert.equal(state.notes[0].imageId,photo.id);assert.deepEqual(state.notes[0].source,row.source);assert.equal(state.notes[0].originalText,'Captured fact');
 applyNotePhotoCommand(state,action(state,{text:'Without photo'},{mode:'remove'}));assert.equal('imageId' in state.notes[0],false);
 applyNotePhotoCommand(state,action(state,{}, {mode:'replace',id:photo.id}),{photo});assert.equal(state.notes[0].imageId,photo.id);
});
test('completed days, stale revisions and image substitution do not change the note',()=>{
 const state=initialState();applyNotePhotoCommand(state,action(state,{}, {mode:'replace',id:photo.id}),{photo});
 const original=structuredClone(state),stale=action(state);stale.payload.recordRevision='0'.repeat(64);
 assert.throws(()=>applyNotePhotoCommand(state,stale),{code:409});
 assert.throws(()=>applyNotePhotoCommand(state,action(state,{}, {mode:'replace',id:'0'.repeat(64)}),{photo}),{code:400});
 assert.throws(()=>applyNotePhotoCommand(state,action(state,{date:'2026-02-30'})),{code:400});assert.deepEqual(state,original);
 act(state,'day.complete',{date,completed:true});const complete=structuredClone(state);
 assert.throws(()=>applyNotePhotoCommand(state,action(state,{date:'2026-11-16'},{mode:'remove'})));assert.deepEqual(state,complete);
 const empty=initialState();act(empty,'day.complete',{date,completed:true});assert.throws(()=>applyNotePhotoCommand(empty,action(empty)));assert.equal(empty.notes.length,0);
});
test('exact note-photo contract rejects client identity, lineage and media metadata injection',()=>{
 const state=initialState();for(const changed of [{ownerId:'other'},{id:'not-new',recordRevision:null},{recordRevision:'a'.repeat(64)},{fields:{...fields,imageId:photo.id}},{fields:{...fields,source:{}}},{photo:{mode:'keep',id:photo.id}},{photo:{mode:'remove',dataUrl}},{photo:{mode:'replace',id:photo.id,dataUrl}}]){
  assert.throws(()=>validateNotePhotoAction({type:'note.photo.save',payload:{...action(state).payload,...changed}}),{code:400});
 }assert.deepEqual(applyNotePhotoCommand(state,{type:'other',payload:{}}),{handled:false});
});

function transactionFixture(){
 const tables=new Map(),transactions=new Map(),files=new Map();let failCommit=false,lostReply=false,uploads=0;
 const table=name=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name);},missing=()=>{throw {code:404};};
 const db={
  async getRow({tableId,rowId}){return structuredClone(table(tableId).get(rowId)??missing());},
  async listRows({tableId,queries=[]}){let rows=[...table(tableId).values()].sort((a,b)=>a.$id.localeCompare(b.$id)),limit=100;for(const raw of queries){const q=JSON.parse(raw);if(q.method==='equal')rows=rows.filter(row=>q.values.includes(row[q.attribute]));if(q.method==='cursorAfter')rows=rows.filter(row=>row.$id>q.values[0]);if(q.method==='limit')limit=q.values[0];}return {rows:structuredClone(rows.slice(0,limit))};},
  async createTransaction(){const $id=randomUUID();transactions.set($id,[]);return {$id};},
  async createRow(input){transactions.get(input.transactionId).push(['create',input]);},async updateRow(input){transactions.get(input.transactionId).push(['update',input]);},async deleteRow(input){transactions.get(input.transactionId).push(['delete',input]);},
  async updateTransaction({transactionId,commit}){const ops=transactions.get(transactionId);if(!commit){transactions.delete(transactionId);return;}if(failCommit){failCommit=false;throw Error('Commit failed');}for(const [kind,input]of ops){const rows=table(input.tableId);if(kind==='delete')rows.delete(input.rowId);else rows.set(input.rowId,{...(rows.get(input.rowId)??{}),...structuredClone(input.data),$id:input.rowId,...(input.permissions?{$permissions:input.permissions}:{})});}transactions.delete(transactionId);if(lostReply){lostReply=false;throw Error('Lost reply');}}
 };
 const storage={async getFile({fileId}){return files.get(fileId)?.metadata??missing();},async createFile({fileId,file,permissions}){if(files.has(fileId))throw {code:409};uploads++;const bytes=Buffer.from(file.source.data),metadata={$id:fileId,name:file.filename,sizeOriginal:bytes.length,$permissions:permissions};files.set(fileId,{bytes,metadata});return metadata;},async getFileView({fileId}){return files.get(fileId)?.bytes??missing();}};
 const state=owner=>{const head=table('workspace_heads').get(owner);return unpackWorkspace(head,[...table('workspace_records').values()].filter(row=>row.ownerId===owner&&row.generation===head.generation));};
 return {db,storage,files,table,state,uploads:()=>uploads,fail(){failCommit=true;},lose(){lostReply=true;}};
}
test('note and media commit atomically, reuse private orphan, and replay exact receipt after response loss',async()=>{
 const fixture=transactionFixture(),owner='fixture-owner',store=createWorkspaceStore(fixture.db,owner);await store.create();
 const before=fixture.state(owner),input={...action(before,{}, {mode:'replace',id:photo.id}),requestId:randomUUID(),revision:digest(before)};
 const context={photo,stageMedia:tx=>stagePhotoMedia({...tx,db:fixture.db,storage:fixture.storage,owner,photo,namespace:'note_photos'})};
 fixture.fail();await assert.rejects(store.command(input,async()=>null,context),/Commit failed/);assert.deepEqual(fixture.state(owner),before);assert.equal(fixture.table('workspace_media').size,0);assert.equal(fixture.table('command_receipts').size,0);assert.equal(fixture.uploads(),1);
 fixture.lose();const saved=await store.command(input,async()=>null,context);assert.equal(fixture.state(owner).notes.length,1);assert.equal(fixture.uploads(),1);assert.equal(fixture.table('workspace_media').size,1);assert.equal(fixture.table('command_receipts').size,1);
 assert.deepEqual(await store.command(input,async()=>{throw Error('No replay lookup');},{stageMedia:()=>{throw Error('No replay upload');}}),saved);assert.equal(fixture.state(owner).notes.length,1);
 await assert.rejects(store.command({...input,payload:{...input.payload,fields:{...fields,text:'Different'}}},async()=>null,context),{code:409});
 assert.equal(fixture.state(owner).loggingStreaks,undefined,'Notes do not add streak events');
});
test('note photo replacement and deletion retain private blobs; other accounts use separate owner mappings',async()=>{
 const fixture=transactionFixture(),owner='one',other='two';for(const id of [owner,other])await createWorkspaceStore(fixture.db,id).create();
 async function save(id,image){const state=fixture.state(id),input={...action(state,{},image?{mode:'replace',id:image.id}:{mode:'remove'}),requestId:randomUUID(),revision:digest(state)};return createWorkspaceStore(fixture.db,id).command(input,async()=>null,image?{photo:image,stageMedia:tx=>stagePhotoMedia({...tx,db:fixture.db,storage:fixture.storage,owner:id,photo:image,namespace:'note_photos'})}:{});}
 await save(owner,photo);await save(other,photo);assert.equal(fixture.files.size,2);const a=fixture.files.get(rowId(owner,'note_photos',photo.id)),b=fixture.files.get(rowId(other,'note_photos',photo.id));assert.deepEqual(a.metadata.$permissions,['read("user:one")']);assert.deepEqual(b.metadata.$permissions,['read("user:two")']);
 const replacement=await validateStoredPhoto((await prepareNotePhoto({dataUrl:'data:image/png;base64,'+(await sharp({create:{width:40,height:40,channels:3,background:'#222222'}}).png().toBuffer()).toString('base64')})).photo);await save(owner,replacement);assert.equal(fixture.state(owner).notes[0].imageId,replacement.id);assert.equal(fixture.state(other).notes[0].imageId,photo.id);
 await save(owner,null);assert.equal('imageId' in fixture.state(owner).notes[0],false);assert.equal(fixture.files.size,3);assert.equal(fixture.table('workspace_media').size,3);
 const state=fixture.state(owner),noteId=state.notes[0].id;await createWorkspaceStore(fixture.db,owner).command({requestId:randomUUID(),revision:digest(state),type:'note.delete',payload:{id:noteId}},async()=>null);assert.equal(fixture.state(owner).notes.length,0);assert.equal(fixture.state(other).notes.length,1);assert.equal(fixture.files.size,3);
});
