// Run only after the account-deletion candidate is deployed. Disposable fixtures only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Client,ID,Permission,Query,Role,TablesDB} from 'node-appwrite';
import {InputFile} from 'node-appwrite/file';
import {request as browserRequest} from 'playwright-core';
import sharp from 'sharp';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId,delay} from './operator.mjs';
import {createBackupStore} from '../server/backup-store.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {backupManifest,backupReferences} from '../server/backup.mjs';
import {normalizePhoto,validateStoredPhoto} from '../server/domain/photo-images.mjs';
import {act} from '../server/domain/workspace.mjs';
import {packWorkspace,rowId} from '../server/data-codec.mjs';
import {stageWorkspaceRows} from '../server/workspace-generations.mjs';

const origin='https://nourishing-cloud.appwrite.network',operator=fixtureOperator(),{db,storage,users,config}=operator;
const ids=[ID.unique(),ID.unique()],created=[],contexts=[],files=[],jobs=[],cleanupFailures=[];
const report={passed:0,phase:0,fixturesCreated:0,seededFiles:0,seededRows:0,requests:0,statusSteps:0,wrongPasswordDenied:0,preparePreservedData:0,crossAccountDenied:0,authCookieCleared:0,deletedAccounts:0,remainingOwnedRows:0,remainingOwnedFiles:0,otherAccountUnchanged:0,realOwnerUnchanged:0,catalogUnchanged:0,cleanupFailures:0};
const ownerTables=['workspace_records','workspace_media','workspace_recoveries','health_reviews','backup_reviews','command_receipts','account_operations','account_deletions'];
const args=(tableId,id)=>({databaseId,tableId,rowId:id}),hash=value=>createHash('sha256').update(value).digest('hex'),identity=head=>Object.fromEntries(['generation','digest','$updatedAt'].map(k=>[k,head[k]]));
const ledger='.local/account-deletion-hosted-fixture.json';mkdirSync('.local',{recursive:true});
const remember=()=>writeFileSync(ledger,JSON.stringify({ids,created,files,jobs,cleanupFailures},null,2));remember();
let realOwner,realBefore,catalogBefore,otherBefore,primaryCreatedAt;
const optional=async work=>{try{return await work();}catch(error){if(error.code===404)return null;throw error;}};
const ownedRows=async owner=>{const groups=[];for(const tableId of ownerTables){const rows=await allRows(db,tableId,[Query.equal('ownerId',owner)]);assert.ok(rows.every(row=>row.ownerId===owner));groups.push({tableId,rows});}return groups;};
async function api(context,path,body,{statuses=[200]}={}){report.requests++;const response=body===undefined?await context.get(origin+path):await context.post(origin+path,{headers:{Origin:origin},data:body});assert.ok(statuses.includes(response.status()),path+' status '+response.status());assert.match(response.headers()['cache-control']??'',/no-store/);return {response,value:await response.json()};}
async function receipt(context,owner){const cookie=(await context.storageState()).cookies.find(row=>row.name==='__Host-nourishing_deletion');assert.ok(cookie?.httpOnly&&cookie.secure);const split=cookie.value.lastIndexOf('.'),id=cookie.value.slice(0,split),secret=cookie.value.slice(split+1),row=await db.getRow(args('account_deletions',id));assert.equal(row.ownerId,owner);assert.equal(row.tokenHash,hash(secret));assert.equal(row.userCreatedAt,primaryCreatedAt);if(!jobs.some(job=>job.id===id)){jobs.push({id,owner,tokenHash:row.tokenHash,userCreatedAt:row.userCreatedAt,createdAt:row.$createdAt});remember();}return cookie;}
async function newContext(cookies=[]){const context=await browserRequest.newContext({timeout:65000,storageState:{cookies,origins:[]}});contexts.push(context);return context;}
async function addPhotoState(owner,source,color,label,{staged=false}={}){
 const normalized=await normalizePhoto('data:image/png;base64,'+(await sharp({create:{width:24,height:28,channels:3,background:color}}).png().toBuffer()).toString('base64')),photo=await validateStoredPhoto(normalized),state=structuredClone(source),store=createBackupStore({db,storage,ownerId:owner});
 state.notes=[];act(state,'note.add',{date:'2026-11-15',text:label});state.notes.at(-1).imageId=photo.id;
 const media=backupReferences(state).map(ref=>({...ref,bytes:photo.bytes.length,width:photo.width,height:photo.height})),current=await store.export(),review=await store.inspect({manifest:backupManifest(state,media),revision:current.revision});
 for(const ref of media){const fileId=rowId(owner,ref.namespace,ref.id);files.push({owner,id:fileId});remember();await store.upload({reviewToken:review.reviewToken,namespace:ref.namespace,photo:{id:photo.id,dataUrl:normalized.dataUrl}});}
 if(staged){const saved=await db.getRow(args('backup_reviews',rowId(owner,review.reviewToken))),packed=packWorkspace(state,owner,saved.generation);await stageWorkspaceRows(db,packed.rows);assert.notEqual((await db.getRow(args('workspace_heads',owner))).generation,saved.generation);}
 else await store.restore({requestId:randomUUID(),reviewToken:review.reviewToken,confirmation:'replace'});
 return {photo,state};
}
try{
 report.phase=1;realOwner=JSON.parse(readFileSync('.local/migration-destination.json','utf8').replace(/^\uFEFF/,'')).accountId;assert.equal(typeof realOwner,'string');assert.ok(realOwner&&!ids.includes(realOwner));realBefore=identity(await db.getRow(args('workspace_heads',realOwner)));catalogBefore=await db.getRow(args('catalog_heads','active'));
 const accounts=[];
 for(const id of ids){const password=randomUUID()+'Aa1!',email=`deletion-${id}@example.com`;let user;try{user=await users.create({userId:id,email,password,name:'Hosted account deletion fixture'});}catch(error){if(error.fixtureOwner===id){created.push(id);remember();}throw error;}created.push(id);remember();accounts.push({id,password,user});const session=await users.createSession({userId:id});await newContext([{name:'__Host-nourishing_session',value:session.secret,domain:new URL(origin).hostname,path:'/',expires:-1,httpOnly:true,secure:true,sameSite:'Lax'}]);}
 report.fixturesCreated=created.length;const [primary,other]=contexts;primaryCreatedAt=accounts[0].user.$createdAt;for(const context of [primary,other])await api(context,'/api/account');
 report.phase=2;const base=(await createBackupStore({db,storage,ownerId:ids[0]}).export()).manifest.workspace;
 await addPhotoState(ids[0],base,'#92a883','Retained synthetic note');await addPhotoState(ids[0],base,'#739fca','Active synthetic note');await addPhotoState(ids[0],base,'#b993ce','Staged synthetic note',{staged:true});
 const otherBase=(await createBackupStore({db,storage,ownerId:ids[1]}).export()).manifest.workspace;const otherPhoto=await addPhotoState(ids[1],otherBase,'#c3ab63','Other synthetic note');
 const orphanId=ID.unique(),orphan=await validateStoredPhoto(await normalizePhoto('data:image/png;base64,'+(await sharp({create:{width:18,height:22,channels:3,background:'#c86e53'}}).png().toBuffer()).toString('base64')));files.push({owner:ids[0],id:orphanId});remember();await storage.createFile({bucketId:'private-media',fileId:orphanId,file:InputFile.fromBuffer(orphan.bytes,orphanId+'.jpg'),permissions:[Permission.read(Role.user(ids[0]))]});
 const store=createWorkspaceStore(db,ids[0]),current=await createBackupStore({db,storage,ownerId:ids[0]}).export();await store.command({requestId:randomUUID(),revision:current.revision,type:'note.add',payload:{date:'2026-11-15',text:'Command receipt fixture'}},async()=>null);
 await db.createRow({...args('health_reviews',ID.unique()),data:{ownerId:ids[0],review:JSON.stringify({fixture:true}),expiresAt:new Date(Date.now()+3600000).toISOString()},permissions:[]});
 await db.createRow({...args('account_operations',ID.unique()),data:{ownerId:ids[0],label:'settled fixture',state:'settled',createdAt:new Date().toISOString(),reason:''},permissions:[]});
 report.seededFiles=files.length;report.seededRows=(await ownedRows(ids[0])).reduce((sum,group)=>sum+group.rows.length,0);assert.ok(report.seededFiles>=5&&report.seededRows>0);assert.ok((await allRows(db,'workspace_recoveries',[Query.equal('ownerId',ids[0])])).length>=2);otherBefore=identity(await db.getRow(args('workspace_heads',ids[1])));
 report.phase=3;const before=identity(await db.getRow(args('workspace_heads',ids[0]))),jobsBefore=(await allRows(db,'account_deletions',[Query.equal('ownerId',ids[0])])).length;
 await api(primary,'/api/account/deletion/prepare',{password:randomUUID()+'wrong-password'},{statuses:[401,403]});assert.equal((await allRows(db,'account_deletions',[Query.equal('ownerId',ids[0])])).length,jobsBefore);report.wrongPasswordDenied=1;
 assert.equal((await api(primary,'/api/account/deletion/prepare',{password:accounts[0].password})).value.status,'ready');await receipt(primary,ids[0]);
 assert.deepEqual(identity(await db.getRow(args('workspace_heads',ids[0]))),before);assert.ok(await users.get({userId:ids[0]}));for(const file of files.filter(f=>f.owner===ids[0]))assert.ok(await storage.getFile({bucketId:'private-media',fileId:file.id}));report.preparePreservedData=1;
 // A second preparation leaves an abandoned review which the accepted cleanup must also remove.
 assert.equal((await api(primary,'/api/account/deletion/prepare',{password:accounts[0].password})).value.status,'ready');const deletionCookie=await receipt(primary,ids[0]),otherCookies=(await other.storageState()).cookies,cross=await newContext([...otherCookies,deletionCookie]);
 await api(cross,'/api/account/deletion/confirm',{confirmation:'delete'},{statuses:[403]});const otherSession=otherCookies.find(c=>c.name==='__Host-nourishing_session').value,otherDb=new TablesDB(new Client().setEndpoint(config.endpoint).setProject(config.projectId).setSession(otherSession));for(const job of jobs)await assert.rejects(otherDb.getRow(args('account_deletions',job.id)),error=>[401,403,404].includes(error.code));
 const forged={...deletionCookie,value:deletionCookie.value.slice(0,-1)+(deletionCookie.value.endsWith('a')?'b':'a')},anonymousWrong=await newContext([forged]);await api(anonymousWrong,'/api/account/deletion/status',{},{statuses:[403,404]});report.crossAccountDenied=1;
 report.phase=4;let progress=(await api(primary,'/api/account/deletion/confirm',{confirmation:'delete'},{statuses:[200,202]})).value;assert.ok(['pending','deleted'].includes(progress.status));assert.equal((await primary.storageState()).cookies.some(c=>c.name==='__Host-nourishing_session'),false);report.authCookieCleared=1;
 const statusOnly=await newContext([deletionCookie]);for(let step=0;progress.status!=='deleted'&&step<160;step++){await delay(200);progress=(await api(statusOnly,'/api/account/deletion/status',{})).value;report.statusSteps++;assert.ok(['pending','deleted'].includes(progress.status));if(report.statusSteps%20===0)console.log(JSON.stringify({statusSteps:report.statusSteps}));}assert.equal(progress.status,'deleted');
 report.phase=5;assert.equal(await optional(()=>users.get({userId:ids[0]})),null);for(const tableId of ['workspace_heads','profiles','account_lifecycle'])assert.equal(await optional(()=>db.getRow(args(tableId,ids[0]))),null);report.deletedAccounts=1;
 report.remainingOwnedRows=(await ownedRows(ids[0])).reduce((sum,group)=>sum+group.rows.length,0);assert.equal(report.remainingOwnedRows,0);for(const file of files.filter(f=>f.owner===ids[0]))if(await optional(()=>storage.getFile({bucketId:'private-media',fileId:file.id})))report.remainingOwnedFiles++;assert.equal(report.remainingOwnedFiles,0);
 const completeJob=await db.getRow(args('account_deletions',jobs.at(-1).id));assert.equal(completeJob.state,'complete');assert.equal(completeJob.ownerId,'');assert.equal(completeJob.userCreatedAt,'');assert.equal((await api(statusOnly,'/api/account/deletion/status',{})).value.status,'deleted');
 assert.deepEqual(identity(await db.getRow(args('workspace_heads',ids[1]))),otherBefore);assert.ok(await users.get({userId:ids[1]}));const otherFile=files.find(f=>f.owner===ids[1]);assert.deepEqual(Buffer.from(await storage.getFileView({bucketId:'private-media',fileId:otherFile.id})),otherPhoto.photo.bytes);await api(other,'/api/account');report.otherAccountUnchanged=1;
 assert.deepEqual(identity(await db.getRow(args('workspace_heads',realOwner))),realBefore);report.realOwnerUnchanged=1;assert.deepEqual(await db.getRow(args('catalog_heads','active')),catalogBefore);report.catalogUnchanged=1;report.passed=1;
}catch(error){report.failureCode=Number.isInteger(error.code)?error.code:0;report.assertionFailed=error.name==='AssertionError'?1:0;process.exitCode=1;}
finally{
 for(const context of contexts)await context.dispose().catch(()=>{});
 const clean=async(scope,work)=>{try{await work();}catch(error){if(error.code!==404)cleanupFailures.push({scope,code:Number.isInteger(error.code)?error.code:0});}};
 for(const owner of created){
  assert.ok(ids.includes(owner)&&owner!==realOwner);
  let verified=false;await clean('fixture-identity',async()=>{const current=await optional(()=>users.get({userId:owner}));if(current){const recorded=JSON.parse(readFileSync(new URL('../.local/fixture-accounts/'+owner+'.json',import.meta.url),'utf8'));assert.equal(current.$id,recorded.ownerId);assert.equal(current.email,recorded.email);assert.equal(current.name,recorded.name);assert.equal(current.$createdAt,recorded.createdAt);}verified=true;});if(!verified)continue;
  // Never infer file ownership from a filename; every file must have the fixture's exact ACL.
  for(const file of files.filter(row=>row.owner===owner))await clean('private-file',async()=>{const metadata=await optional(()=>storage.getFile({bucketId:'private-media',fileId:file.id}));if(!metadata)return;assert.deepEqual(metadata.$permissions,[Permission.read(Role.user(owner))]);await storage.deleteFile({bucketId:'private-media',fileId:file.id});});
  for(const tableId of ['workspace_recoveries','backup_reviews','health_reviews','command_receipts','workspace_media','workspace_records'])await clean(tableId,async()=>{const rows=await allRows(db,tableId,[Query.equal('ownerId',owner)]);assert.ok(rows.every(row=>row.ownerId===owner));for(const row of rows)await db.deleteRow(args(tableId,row.$id));});
  for(const tableId of ['workspace_heads','profiles'])await clean(tableId,async()=>{const row=await optional(()=>db.getRow(args(tableId,owner)));if(!row)return;if(tableId==='workspace_heads')assert.equal(row.ownerId,owner);await db.deleteRow(args(tableId,owner));});
  await clean('fixture-account',()=>users.delete({userId:owner}));
 }
 // The completed receipt deliberately has no owner ID. Its immutable token hash proves fixture origin.
 for(const proof of jobs)await clean('fixture-receipt',async()=>{const row=await optional(()=>db.getRow(args('account_deletions',proof.id)));if(!row)return;assert.equal(row.tokenHash,proof.tokenHash);assert.equal(row.$createdAt,proof.createdAt);if(row.ownerId===''&&row.state==='complete')assert.equal(row.userCreatedAt,'');else{assert.equal(row.ownerId,proof.owner);assert.equal(row.userCreatedAt,proof.userCreatedAt);}await db.deleteRow(args('account_deletions',proof.id));});
 if(realBefore)await clean('owner-baseline',async()=>assert.deepEqual(identity(await db.getRow(args('workspace_heads',realOwner))),realBefore));if(catalogBefore)await clean('catalog-baseline',async()=>assert.deepEqual(await db.getRow(args('catalog_heads','active')),catalogBefore));
 report.cleanupFailures=cleanupFailures.length;if(cleanupFailures.length){report.passed=0;process.exitCode=1;}remember();writeFileSync('.local/account-deletion-hosted-verification.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report));
