import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client,Users,TablesDB,Query} from 'node-appwrite';
import {createAppwriteService} from '../server/appwrite-service.mjs';
import {readConfig} from '../server/config.mjs';
import {allRows,maybeGet} from './operator.mjs';

const config=readConfig({APPWRITE_ENDPOINT:'https://nyc.cloud.appwrite.io/v1',APPWRITE_PROJECT_ID:'6abac02e002f10c31ac2',PUBLIC_ORIGIN:'https://nourishing.app'});
const key=JSON.parse(readFileSync(new URL('../.local/integration-key.json',import.meta.url),'utf8').replace(/^\uFEFF/,'' )).secret;
if(!key)throw Error('Temporary integration key missing.');
const admin=new Client().setEndpoint(config.endpoint).setProject(config.project).setKey(key);
const users=new Users(admin),tables=new TablesDB(admin),api=createAppwriteService(config,key,'Nourishing integration test');
const owned=[],identities=new Map(),checks=[],limits=[];
const args=rowId=>({databaseId:'nourishing',tableId:'profiles',rowId});
const denied=async work=>assert.rejects(work,error=>[401,403,404].includes(error.code));
let failed=false;
try {
  const sessions=[];
  for(let i=0;i<2;i++){
    const email=`nourishing-test-${randomBytes(8).toString('hex')}@example.com`,password=`Aa!${randomBytes(24).toString('base64url')}`;
    const session=await api.register({email,password,name:'Migration test'});
    owned.push(session.userId);sessions.push(session);
    const user=await users.get({userId:session.userId});assert.equal(user.email,email);assert.equal(user.name,'Migration test');
    identities.set(session.userId,{email,name:user.name,createdAt:user.$createdAt});
    const hour=Math.floor(Date.now()/3600000);
    limits.push(createHash('sha256').update(`${hour}:${email}`).digest('hex').slice(0,32));
    assert.ok(session.secret);
  }
  checks.push('Registration and secure server sessions');
  const [a,b]=await Promise.all(sessions.map(s=>api.current(s.secret)));
  assert.notEqual(a.id,b.id);assert.equal(a.profile.units,'metric');
  await api.updateProfile(sessions[0].secret,{units:'imperial',timeZone:'America/Chicago'});
  assert.equal((await api.current(sessions[0].secret)).profile.units,'imperial');
  assert.equal((await api.current(sessions[1].secret)).profile.units,'metric');
  checks.push('Private profile initialization, persistence, and separate accounts');
  const clientB=new TablesDB(new Client().setEndpoint(config.endpoint).setProject(config.project).setSession(sessions[1].secret));
  await denied(()=>clientB.getRow(args(a.id)));
  await denied(()=>clientB.updateRow({...args(a.id),data:{units:'metric'}}));
  await denied(()=>clientB.createRow({...args('unauthorized-profile'),data:{timeZone:'UTC',units:'metric'}}));
  await denied(()=>new TablesDB(new Client().setEndpoint(config.endpoint).setProject(config.project)).getRow(args(a.id)));
  checks.push('Direct SDK cross-account reads/writes, profile squatting, and anonymous reads denied');
  await api.logout(sessions[0].secret);
  await denied(()=>api.current(sessions[0].secret));
  assert.equal((await api.current(sessions[1].secret)).id,b.id);
  checks.push('Revoked session rejected; other account survives');
} catch(error){failed=true;console.error(JSON.stringify({status:'failed',code:error.code??null,type:error.type??error.name,checks}));}
finally{
  for(const id of owned)try{
    const identity=identities.get(id);assert.ok(identity);
    const user=await users.get({userId:id});assert.equal(user.email,identity.email);assert.equal(user.name,identity.name);assert.equal(user.$createdAt,identity.createdAt);
    assert.equal(await maybeGet(tables,'workspace_heads',id),null);
    const operations=await allRows(tables,'account_operations',[Query.equal('ownerId',id)]);
    assert.ok(operations.every(row=>row.ownerId===id&&row.state==='settled'));
    assert.equal((await allRows(tables,'account_deletions',[Query.equal('ownerId',id)])).length,0);
    const lifecycle=await maybeGet(tables,'account_lifecycle',id);
    if(lifecycle){assert.equal(lifecycle.ownerId,id);assert.equal(lifecycle.state,'active');assert.equal(lifecycle.jobId,'');}
    for(const operation of operations)await tables.deleteRow({databaseId:'nourishing',tableId:'account_operations',rowId:operation.$id});
    if(await maybeGet(tables,'profiles',id))await tables.deleteRow(args(id));
    if(lifecycle)await tables.deleteRow({databaseId:'nourishing',tableId:'account_lifecycle',rowId:id});
    await users.delete({userId:id});
  }catch(error){failed=true;console.error(JSON.stringify({cleanup:'failed',code:Number.isInteger(error.code)?error.code:0}));}
  for(const rowId of limits)try{await tables.deleteRow({databaseId:'nourishing',tableId:'login_limits',rowId});}catch(error){if(error.code!==404){failed=true;console.error(JSON.stringify({cleanup:'failed',resource:rowId,code:error.code}));}}
}
mkdirSync(new URL('../.local/',import.meta.url),{recursive:true});
const result={at:new Date().toISOString(),status:failed?'failed':'passed',checks,testAccountsCreated:owned.length,cleanup:failed?'inspect errors':'completed',notTested:['Email delivery and emailed recovery tokens','Browser and Android sessions','Diary and media migration']};
writeFileSync(new URL('../.local/account-verification.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));if(failed)process.exitCode=1;
