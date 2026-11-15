// Explicit disposable fixture only. Run after deploying the targeted cleanup worker.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {ID,Permission,Query,Role} from 'node-appwrite';
import sharp from 'sharp';
import {fixtureOperator} from './fixture-operator.mjs';
import {operator,allRows,databaseId} from './operator.mjs';
import {createAccountDeletion} from '../server/account-deletion.mjs';
import {createAccountLifecycle} from '../server/account-lifecycle.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {normalizePhoto,validateStoredPhoto} from '../server/domain/photo-images.mjs';
import {stagePhotoMedia} from '../server/photo-storage.mjs';
import {rowId} from '../server/data-codec.mjs';

const run=promisify(execFile),raw=operator(),fixture=fixtureOperator(),{db,storage}=raw,owner=ID.unique();
const args=(tableId,id)=>({databaseId,tableId,rowId:id}),hash=value=>createHash('sha256').update(value).digest('hex');
const identity=head=>Object.fromEntries(['generation','digest','$updatedAt'].map(key=>[key,head[key]]));
const optional=async work=>{try{return await work();}catch(error){if(error.code===404)return null;throw error;}};
const tables=['workspace_records','workspace_media','workspace_recoveries','health_reviews','backup_reviews','command_receipts','account_operations','account_deletions','push_deliveries'];
const singletons=['push_accounts','fasting_dispatch','workspace_heads','profiles','reminder_dispatch'];
const report={passed:0,phase:0,fixturesCreated:0,seededRows:0,seededFiles:0,executions:0,workerSteps:0,deletedAccounts:0,remainingOwnedRows:0,remainingOwnedFiles:0,realOwnerUnchanged:0,cleanupFailures:0};
const ledger={owner,created:false,files:[],job:null,executions:[],executionUnresolved:false,cleanupFailures:[]};
mkdirSync('.local',{recursive:true});const remember=()=>writeFileSync('.local/account-cleanup-cloud-fixture.json',JSON.stringify(ledger,null,2));remember();
let realOwner,realBefore,proof;
async function exactFixture(){
 const current=await optional(()=>raw.users.get({userId:owner}));if(!current)return;
 const recorded=proof??JSON.parse(readFileSync('.local/fixture-accounts/'+owner+'.json','utf8'));
 assert.equal(current.$id,owner);assert.equal(current.$createdAt,recorded.createdAt);assert.equal(current.email,recorded.email);assert.equal(current.name,recorded.name);
}
try{
 report.phase=1;realOwner=JSON.parse(readFileSync('.local/migration-destination.json','utf8').replace(/^\uFEFF/,'')).accountId;assert.ok(realOwner&&realOwner!==owner);realBefore=identity(await db.getRow(args('workspace_heads',realOwner)));
 // Invoke the installed CLI entry directly on Windows; no shell quoting or credential arguments.
 const cli=process.env.APPWRITE_CLI_ENTRY??(process.platform==='win32'?join(process.env.APPDATA,'npm','node_modules','appwrite-cli','run.js'):null);if(cli)assert.ok(existsSync(cli),'Installed Appwrite CLI entry is required.');
 const name='Private cleanup worker fixture',email=`cleanup-${owner}@example.com`;let user;
 try{user=await fixture.users.create({userId:owner,email,password:randomUUID()+'Aa1!',name});}catch(error){if(error.fixtureOwner===owner){ledger.created=true;remember();}throw error;}
 ledger.created=true;proof={createdAt:user.$createdAt,email,name};ledger.identity=proof;remember();report.fixturesCreated=1;
 const store=createWorkspaceStore(db,owner);await store.create();let head=await db.getRow(args('workspace_heads',owner));
 const normalized=await normalizePhoto('data:image/png;base64,'+(await sharp({create:{width:20,height:24,channels:3,background:'#7eae98'}}).png().toBuffer()).toString('base64')),photo=await validateStoredPhoto(normalized);
 const fileId=rowId(owner,'note_photos',photo.id);ledger.files.push(fileId);remember();
 await store.command({requestId:randomUUID(),revision:head.digest,type:'note.photo.save',payload:{id:null,recordRevision:null,fields:{date:'2026-11-15',time:'12:00',group:'Lunch',text:'Synthetic worker cleanup attachment'},photo:{mode:'replace',id:photo.id}}},async()=>null,{photo,asOf:'2026-11-15T12:00:00Z',today:'2026-11-15',timeZone:'UTC',stageMedia:context=>stagePhotoMedia({db,storage,owner,...context,photo,namespace:'note_photos'})});
 await db.createRow({...args('push_accounts',owner),data:{ownerId:owner,version:0,payload:JSON.stringify({devices:[]})},permissions:[]});
 const deliveryId=rowId(owner,randomUUID()),stamp=new Date().toISOString();
 await db.createRow({...args('push_deliveries',deliveryId),data:{ownerId:owner,fingerprint:hash('synthetic-delivery'),outcome:'accepted',statusCode:201,createdAt:stamp,completedAt:stamp},permissions:[]});
 for(const tableId of ['fasting_dispatch','reminder_dispatch'])await db.createRow({...args(tableId,owner),data:{ownerId:owner,generation:head.generation,token:hash('synthetic-dispatch'),dueAt:'2030-01-01T00:00:00.000Z',repairAt:'2030-01-01T00:00:00.000Z',executionId:''},permissions:[]});
 for(const [tableId,id] of [['push_accounts',owner],['push_deliveries',deliveryId],['fasting_dispatch',owner],['reminder_dispatch',owner]])assert.deepEqual((await db.getRow(args(tableId,id))).$permissions,[]);report.seededPushAndDispatchRows=4;
 report.seededRows=(await allRows(db,'workspace_records',[Query.equal('ownerId',owner)])).length;report.seededFiles=1;assert.ok(report.seededRows>0);assert.deepEqual((await storage.getFile({bucketId:'private-media',fileId})).$permissions,[Permission.read(Role.user(owner))]);
 report.phase=2;const lifecycle=createAccountLifecycle({db}),deletion=createAccountDeletion({...raw,lifecycle}),prepared=await deletion.prepare(owner),job=await db.getRow(args('account_deletions',prepared.ticket.id));
 assert.equal(job.ownerId,owner);assert.equal(job.userCreatedAt,user.$createdAt);assert.equal(job.tokenHash,hash(prepared.ticket.secret));ledger.job={id:job.$id,tokenHash:job.tokenHash,createdAt:job.$createdAt,userCreatedAt:job.userCreatedAt};remember();
 await deletion.begin(prepared.ticket,owner);
 // There is no browser or status-step request. Only this exact private job is dispatched.
 report.phase=3;
 for(let index=0;index<10;index++){
  ledger.executionUnresolved=true;remember();
  const parameters=['functions','create-execution','--function-id','nourishing-account-cleanup','--async=false','--body',JSON.stringify({jobId:job.$id}),'--raw'];
  const {stdout}=await run(cli?process.execPath:'appwrite',cli?[cli,...parameters]:parameters,{timeout:120000,maxBuffer:1024*1024,windowsHide:true});
  const execution=JSON.parse(stdout.trim());assert.equal(execution.resourceId,'nourishing-account-cleanup');assert.equal(execution.status,'completed');ledger.executionUnresolved=false;ledger.executions.push(execution.$id);remember();
  assert.equal(execution.responseStatusCode,200);const body=JSON.parse(execution.responseBody);assert.equal(body.ok,true);assert.equal(body.enabled,true);assert.equal(body.failed,0);assert.equal(body.needsAttention,0);assert.ok(body.examined<=1);assert.equal(body.pruned,0);assert.equal(body.reviewsPruned,0);
  report.executions++;report.workerSteps+=body.steps;
  const current=await db.getRow(args('account_deletions',job.$id));assert.equal(current.tokenHash,job.tokenHash);if(current.state==='complete')break;
 }
 report.phase=4;const complete=await db.getRow(args('account_deletions',job.$id));assert.equal(complete.state,'complete');assert.equal(complete.ownerId,'');assert.equal(complete.userCreatedAt,'');assert.equal(await optional(()=>raw.users.get({userId:owner})),null);report.deletedAccounts=1;
 for(const tableId of tables)report.remainingOwnedRows+=(await allRows(db,tableId,[Query.equal('ownerId',owner)])).length;assert.equal(report.remainingOwnedRows,0);
 for(const tableId of [...singletons,'account_lifecycle'])assert.equal(await optional(()=>db.getRow(args(tableId,owner))),null);
 for(const id of ledger.files)if(await optional(()=>storage.getFile({bucketId:'private-media',fileId:id})))report.remainingOwnedFiles++;assert.equal(report.remainingOwnedFiles,0);
 assert.deepEqual(identity(await db.getRow(args('workspace_heads',realOwner))),realBefore);report.realOwnerUnchanged=1;report.passed=1;
}catch(error){report.failureCode=Number.isInteger(error.code)?error.code:0;report.assertionFailed=error.name==='AssertionError'?1:0;process.exitCode=1;}
finally{
 const clean=async(scope,work)=>{try{await work();}catch(error){if(error.code!==404)ledger.cleanupFailures.push({scope,code:Number.isInteger(error.code)?error.code:0});}};
 if(ledger.created&&!ledger.executionUnresolved){
  let verified=false;await clean('identity',async()=>{await exactFixture();verified=true;});
  if(verified){
   for(const id of ledger.files)await clean('file',async()=>{const file=await optional(()=>storage.getFile({bucketId:'private-media',fileId:id}));if(!file)return;assert.deepEqual(file.$permissions,[Permission.read(Role.user(owner))]);await storage.deleteFile({bucketId:'private-media',fileId:id});});
   for(const tableId of tables.filter(table=>!['account_operations','account_deletions'].includes(table)))await clean(tableId,async()=>{const rows=await allRows(db,tableId,[Query.equal('ownerId',owner)]);assert.ok(rows.every(row=>row.ownerId===owner));for(const row of rows)await db.deleteRow(args(tableId,row.$id));});
   for(const tableId of singletons)await clean(tableId,async()=>{const row=await optional(()=>db.getRow(args(tableId,owner)));if(!row)return;if(tableId!=='profiles')assert.equal(row.ownerId,owner);await db.deleteRow(args(tableId,owner));});
   if(ledger.job)await clean('receipt',async()=>{const job=await optional(()=>db.getRow(args('account_deletions',ledger.job.id)));if(!job)return;assert.equal(job.tokenHash,ledger.job.tokenHash);assert.equal(job.$createdAt,ledger.job.createdAt);if(job.state==='complete'){assert.equal(job.ownerId,'');assert.equal(job.userCreatedAt,'');}else{assert.equal(job.ownerId,owner);assert.equal(job.userCreatedAt,ledger.job.userCreatedAt);}await db.deleteRow(args('account_deletions',job.$id));});
   await clean('fixture',()=>fixture.users.delete({userId:owner}));
  }
 }else if(ledger.executionUnresolved)ledger.cleanupFailures.push({scope:'execution_completion_unknown',code:0});
 if(realBefore)await clean('owner-baseline',async()=>assert.deepEqual(identity(await db.getRow(args('workspace_heads',realOwner))),realBefore));
 report.cleanupFailures=ledger.cleanupFailures.length;if(report.cleanupFailures){report.passed=0;process.exitCode=1;}remember();writeFileSync('.local/account-cleanup-cloud-verification.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report));
