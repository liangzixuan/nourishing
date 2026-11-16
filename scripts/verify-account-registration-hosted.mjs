// Run after deployment. Uses one disposable account; never changes an existing account.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {Client,Query,TablesDB} from 'node-appwrite';
import {request} from 'playwright-core';
import {operator,allRows,databaseId,maybeGet} from './operator.mjs';
import {readSession} from '../server/session-cookie.mjs';

const origin=process.env.VERIFY_ORIGIN||'https://nourishing-cloud.appwrite.network',{config,db,users}=operator();
assert.ok(['https://nourishing-cloud.appwrite.network','https://nourishing.app'].includes(origin));
const email=`registration-${randomUUID()}@example.com`,name='Hosted registration fixture',password=`Aa1!${randomUUID()}${randomUUID()}`;
const ledger={email,name,startedAt:new Date().toISOString(),preflightAbsent:false,registrationStarted:false,identity:null,cleaned:false};
const report={origin,at:new Date().toISOString(),passed:0,phase:0,registered:0,lifecycleInitialized:0,privateSession:0,profileUpdated:0,directWriteDenied:0,logoutVerified:0,loginVerified:0,realOwnerUnchanged:0,cleanupComplete:0,cleanupFailures:0};
mkdirSync('.local',{recursive:true});
const remember=()=>writeFileSync('.local/account-registration-hosted-fixture.json',JSON.stringify(ledger,null,2));remember();
const args=(tableId,rowId)=>({databaseId,tableId,rowId});
const headIdentity=head=>Object.fromEntries(['generation','digest','$updatedAt'].map(key=>[key,head[key]]));
const budgetIds=new Set(),budgetAt=time=>budgetIds.add(createHash('sha256').update(`${Math.floor(time/3600000)}:${email}`).digest('hex').slice(0,32));
let context,realOwner,realBefore,registrationEnded;
async function call(path,{method='GET',data,status=200}={}){
 const budget=path==='/api/auth/register'||path==='/api/auth/login';if(budget)budgetAt(Date.now());
 try{const response=await context.fetch(origin+path,{method,...(data===undefined?{}:{headers:{Origin:origin},data})});assert.equal(response.status(),status,path);assert.match(response.headers()['cache-control']??'',/no-store/);return await response.json();}
 finally{if(budget)budgetAt(Date.now());}
}
async function exactIdentity(user){
 assert.equal(user.email,email);assert.equal(user.name,name);assert.notEqual(user.$id,realOwner);
 const created=Date.parse(user.$createdAt);assert.ok(Number.isFinite(created));
 if(ledger.identity){assert.equal(user.$id,ledger.identity.id);assert.equal(user.$createdAt,ledger.identity.createdAt);}
 else{assert.ok(ledger.preflightAbsent&&ledger.registrationStarted);assert.ok(created>=Date.parse(ledger.registrationStarted)-60000&&created<=(registrationEnded??Date.now())+60000);ledger.identity={id:user.$id,createdAt:user.$createdAt};remember();}
 return user.$id;
}
async function findFixture(){
 if(ledger.identity){try{const user=await users.get({userId:ledger.identity.id});await exactIdentity(user);return user;}catch(error){if(error.code===404)return null;throw error;}}
 if(!ledger.preflightAbsent||!ledger.registrationStarted)return null;
 const result=await users.list({queries:[Query.equal('email',email),Query.limit(2)]});assert.ok(result.users.length<=1);
 if(!result.users.length)return null;await exactIdentity(result.users[0]);return result.users[0];
}
async function cleanupFixture(){
 const user=await findFixture();if(!user)return;
 const owner=await exactIdentity(user);
 // This flow never creates diary data. Retain an unexpected workspace for investigation.
 assert.equal(await maybeGet(db,'workspace_heads',owner),null);
 const tables=['workspace_records','workspace_media','workspace_recoveries','health_reviews','backup_reviews','command_receipts','account_deletions'];
 for(const table of tables)assert.equal((await allRows(db,table,[Query.equal('ownerId',owner)])).length,0);
 const operations=await allRows(db,'account_operations',[Query.equal('ownerId',owner)]);
 assert.ok(operations.every(row=>row.ownerId===owner&&row.state==='settled'));
 const lifecycle=await maybeGet(db,'account_lifecycle',owner);
 if(lifecycle){assert.equal(lifecycle.ownerId,owner);assert.equal(lifecycle.state,'active');assert.equal(lifecycle.jobId,'');}
 await exactIdentity(await users.get({userId:owner}));
 for(const row of operations)await db.deleteRow(args('account_operations',row.$id));
 if(await maybeGet(db,'profiles',owner))await db.deleteRow(args('profiles',owner));
 if(lifecycle)await db.deleteRow(args('account_lifecycle',owner));
 await users.delete({userId:owner});
 await assert.rejects(users.get({userId:owner}),error=>error.code===404);
 assert.equal(await maybeGet(db,'account_lifecycle',owner),null);assert.equal(await maybeGet(db,'profiles',owner),null);
 ledger.cleaned=true;remember();
}
try{
 report.phase=1;realOwner=JSON.parse(readFileSync('.local/migration-destination.json','utf8').replace(/^\uFEFF/,'')).accountId;assert.ok(typeof realOwner==='string'&&realOwner);realBefore=headIdentity(await db.getRow(args('workspace_heads',realOwner)));
 assert.equal((await users.list({queries:[Query.equal('email',email),Query.limit(2)]})).users.length,0);ledger.preflightAbsent=true;remember();
 context=await request.newContext({timeout:65000});ledger.registrationStarted=new Date().toISOString();remember();
 try{await call('/api/auth/register',{method:'POST',data:{email,password,name}});}finally{registrationEnded=Date.now();}
 const account=await call('/api/account');assert.equal(account.email,email);assert.equal(account.name,name);assert.equal(account.profile.units,'metric');
 const owner=await exactIdentity(await users.get({userId:account.id}));assert.equal(owner,account.id);report.registered=1;
 const lifecycle=await db.getRow(args('account_lifecycle',owner));assert.equal(lifecycle.ownerId,owner);assert.equal(lifecycle.state,'active');assert.equal(lifecycle.jobId,'');assert.ok(Number.isSafeInteger(lifecycle.version));report.lifecycleInitialized=1;
 const cookie=(await context.storageState()).cookies.find(row=>row.name==='__Host-nourishing_session');assert.ok(cookie?.secure&&cookie.httpOnly);assert.equal(cookie.path,'/');assert.equal(cookie.sameSite,'Strict');assert.equal(cookie.domain,new URL(origin).hostname);assert.ok(cookie.expires>Date.now()/1000);report.privateSession=1;
 report.phase=2;await call('/api/profile',{method:'PUT',data:{units:'imperial',timeZone:'America/Chicago'}});
 const updated=await call('/api/account');assert.equal(updated.profile.units,'imperial');assert.equal(updated.profile.timeZone,'America/Chicago');report.profileUpdated=1;
 const ownDb=new TablesDB(new Client().setEndpoint(config.endpoint).setProject(config.projectId).setSession(readSession(`${cookie.name}=${cookie.value}`)));
 assert.equal((await ownDb.getRow(args('profiles',owner))).units,'imperial');
 await assert.rejects(ownDb.updateRow({...args('profiles',owner),data:{units:'metric'}}),error=>[401,403].includes(error.code));
 await assert.rejects(ownDb.getRow(args('account_lifecycle',owner)),error=>[401,403,404].includes(error.code));
 assert.equal((await call('/api/account')).profile.units,'imperial');report.directWriteDenied=1;
 report.phase=3;await call('/api/auth/logout',{method:'POST',data:{}});assert.ok(!(await context.storageState()).cookies.some(row=>row.name==='__Host-nourishing_session'));await call('/api/account',{status:401});report.logoutVerified=1;
 await call('/api/auth/login',{method:'POST',data:{email,password}});const restored=await call('/api/account');assert.equal(restored.id,owner);assert.equal(restored.profile.units,'imperial');assert.equal(restored.profile.timeZone,'America/Chicago');report.loginVerified=1;
 await call('/api/auth/logout',{method:'POST',data:{}});report.passed=1;
}catch(error){report.passed=0;report.failureCode=Number.isInteger(error.code)?error.code:0;report.assertionFailed=Number(error.code==='ERR_ASSERTION');}
finally{
 if(context)try{await context.dispose();}catch{report.cleanupFailures++;}
 try{await cleanupFixture();report.cleanupComplete=1;}catch(error){report.cleanupFailures++;report.cleanupCode=Number.isInteger(error.code)?error.code:0;}
 // Only exact per-hour rate-limit keys for this unique email are eligible.
 for(const id of budgetIds)try{if(await maybeGet(db,'login_limits',id))await db.deleteRow(args('login_limits',id));}catch{report.cleanupFailures++;}
 if(realBefore)try{assert.deepEqual(headIdentity(await db.getRow(args('workspace_heads',realOwner))),realBefore);report.realOwnerUnchanged=1;}catch{report.cleanupFailures++;}
 if(report.cleanupFailures)report.passed=0;remember();writeFileSync('.local/account-registration-hosted-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
}
