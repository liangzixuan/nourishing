import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {Client,TablesDB,Storage,Account,ID,Query,Permission,Role} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {databaseId,allRows} from './operator.mjs';
import {packWorkspace,catalogRow} from '../server/data-codec.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {calculateSummary} from '../server/domain/nutrition.mjs';
import {importRows} from './import-rows.mjs';
const {db,users,config}=fixtureOperator(),origin=process.env.VERIFY_ORIGIN;
const destination=JSON.parse(readFileSync(new URL('../.local/migration-destination.json',import.meta.url)));
const owner=destination.accountId,userId=ID.unique(),password=randomBytes(24).toString('base64url'),email=`data-${userId}@example.com`;
const args=(tableId,rowId)=>({databaseId,tableId,rowId});
const state={profile:{},settings:{groups:['Uncategorized']},foods:[],recipes:[],meals:[],entries:[],biometrics:[],notes:[]};
const packed=packWorkspace(state,userId,ID.unique());
const cleanup=[],report={at:new Date().toISOString(),hosted:!!origin,checks:[],search:[]};
const client=()=>new Client().setEndpoint(config.endpoint).setProject(config.projectId);
const denied=async fn=>{await assert.rejects(fn,error=>[401,403,404].includes(error.code));};
writeFileSync(new URL('../.local/data-test-owned.json',import.meta.url),JSON.stringify({userId,rowIds:packed.rows.map(r=>r.$id)}));
let created=false;
try{
 await users.create({userId,email,password,name:'Data verification fixture'});created=true;
 const session=await users.createSession({userId}),c=client().setSession(session.secret),userDb=new TablesDB(c),repo=createDataRepository(userDb,userId);
 const ownerRows=await allRows(db,'workspace_records',[Query.equal('ownerId',owner)]);
 const images=await allRows(db,'workspace_media',[Query.equal('ownerId',owner)]);
 assert.ok(ownerRows.length&&images.length);
 for(const remote of [client(),c]){
  const remoteDb=new TablesDB(remote),storage=new Storage(remote);
  await denied(()=>remoteDb.getRow(args('workspace_heads',owner)));
  await denied(()=>remoteDb.getRow(args('workspace_records',ownerRows[0].$id)));
  await denied(()=>remoteDb.updateRow({...args('workspace_records',ownerRows[0].$id),data:{day:ownerRows[0].day}}));
  await denied(()=>storage.getFileView({bucketId:'private-media',fileId:images[0].fileId}));
  const visible=await remoteDb.listRows({databaseId,tableId:'workspace_records',queries:[Query.equal('ownerId',owner)],total:true}).catch(error=>{if([401,403].includes(error.code))return {total:0};throw error;});assert.equal(visible.total,0);
 }
 report.checks.push('anonymous and another account cannot read or change owner records or read photos');
 await denied(()=>new TablesDB(client()).getRow(args('catalog_heads','active')));
 for(const row of packed.rows)cleanup.push(args('workspace_records',row.$id));
 await importRows(db,'workspace_records',packed.rows);
 cleanup.push(args('workspace_heads',userId));
 await db.createRow({...args('workspace_heads',userId),data:packed.head,permissions:[Permission.read(Role.user(userId))]});
 assert.deepEqual(await repo.readState(),state);
 assert.deepEqual((await repo.diary('2026-11-14')).summary,calculateSummary(state,'2026-11-14'));
 assert.equal((await repo.catalogStatus()).count,34885);
 for(const query of ['', 'rice', 'bok choy','ri','crème','!!!']){
  const start=performance.now(),result=await repo.search({query,limit:5});
  assert.ok(query==='!!!'?result.items.length===0:result.items.length>0);assert.ok(result.items.length<=5);
  report.search.push({query,returned:result.items.length,ms:Math.round(performance.now()-start)});
 }
 assert.equal((await repo.search({query:'',offset:5000,limit:5})).nextOffset,5005);
 const last=await repo.search({query:'',offset:34880,limit:5});assert.equal(last.items.length,5);assert.equal(last.nextOffset,null);assert.equal(last.total,34885);
 if(process.argv[2]){
  const source=new DatabaseSync(process.argv[2],{readOnly:true});
  try{const head=await db.getRow(args('catalog_heads','active'));let checked=0;
   for(const input of source.prepare('SELECT id,name,search_text,priority,body,original,compact FROM foods ORDER BY id LIMIT 1 OFFSET ?').iterate(0)){const expected=catalogRow(input,head.generation),actual=await userDb.getRow(args('catalog_foods',expected.$id));for(const [key,value]of Object.entries(expected))assert.deepEqual(actual[key],value);checked++;}
   for(const offset of [17442,34884]){const input=source.prepare('SELECT id,name,search_text,priority,body,original,compact FROM foods ORDER BY id LIMIT 1 OFFSET ?').get(offset);const actual=await repo.food(input.id);assert.deepEqual(actual,{food:JSON.parse(input.body),original:JSON.parse(input.original)});checked++;}
   report.fullCatalogSamples=checked;
  }finally{source.close();}
 }
 if(origin){
  const request=(path,cookie)=>fetch(new URL(path,origin),{headers:cookie?{cookie}:{}});
  assert.equal((await request('/api/catalog/status')).status,401);
  const login=await fetch(new URL('/api/auth/login',origin),{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  for(const path of ['/api/catalog/status','/api/catalog/search?q=rice&limit=5','/api/diary?date=2026-11-14']){
   const response=await request(path,cookie);assert.equal(response.status,200,path);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();
   if(path.startsWith('/api/diary'))assert.deepEqual(body.summary,calculateSummary(state,'2026-11-14'));
   if(path.includes('/search'))assert.ok(body.items.length===5);
  }
  assert.equal((await request('/api/diary?date=2026-11-14&ownerId='+owner,cookie)).status,400);
  const image=images[0];assert.equal((await request(`/api/media?namespace=${image.namespace}&id=${image.sourceId}`,cookie)).status,404);
  await users.deleteSessions({userId});assert.equal((await request('/api/catalog/status',cookie)).status,401);
  report.checks.push('hosted login, authenticated reads, owner override denial, photo isolation, and session revocation');
 }else{await users.deleteSessions({userId});await denied(()=>new Account(c).get());}
 report.checks.push('fixture workspace lossless round trip and nutrition comparison; shared catalog searches');
}finally{
 for(const resource of cleanup.reverse())try{await db.deleteRow(resource);}catch(error){if(error.code!==404)throw error;}
 if(created){try{await db.deleteRow(args('profiles',userId));}catch(error){if(error.code!==404)throw error;}await users.delete({userId});}
 report.fixtureRemoved=true;
}
report.status='passed';writeFileSync(new URL('../.local/data-verification.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
