// Bounded transport diagnosis. Never log request headers, session secrets or raw errors.
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {request as playwrightRequest} from 'playwright-core';
import {ID,Query} from 'node-appwrite';
import {operator,allRows,databaseId} from './operator.mjs';
const {users,db}=operator(),owner=ID.unique(),origin='https://nourishing-cloud.appwrite.network',results=[],cleanupFailures=[];let created=false,context;
// The follow-up isolates one upload after runtime logs proved SSR returns 413 in <300 ms.
const confirmUpload=process.argv.includes('--confirm-upload'),timeoutMs=confirmUpload?60000:20000;
const safeError=error=>({name:['TimeoutError','AbortError'].includes(error?.name)?error.name:'RequestError',code:Number.isInteger(error?.code)?error.code:null});
const report={at:new Date().toISOString(),results},ledger='.local/body-limit-probe-fixture.json';writeFileSync(ledger,JSON.stringify({owner,created:false}));
try{
 await users.create({userId:owner,email:`body-probe-${owner}@example.com`,password:randomUUID()+'Aa1!',name:'Body limit probe'});created=true;writeFileSync(ledger,JSON.stringify({owner,created}));
 const secret=(await users.createSession({userId:owner})).secret;context=await playwrightRequest.newContext({timeout:timeoutMs});
 async function probe(client,path,bytes,signed=true){const start=performance.now(),body=JSON.stringify({padding:'x'.repeat(bytes)}),headers={Origin:origin,'Content-Type':'application/json',...(signed?{Cookie:'__Host-nourishing_session='+secret}:{})};let result;
  try{const response=client==='fetch'?await fetch(origin+path,{method:'POST',headers,body,signal:AbortSignal.timeout(timeoutMs)}):await context.post(origin+path,{headers,data:body});const status=client==='fetch'?response.status:response.status();await (client==='fetch'?response.arrayBuffer():response.body());result={status};}
  catch(error){result={error:safeError(error)};}
  results.push({client,path,bytes:Buffer.byteLength(body),signed,elapsedMs:Math.round(performance.now()-start),...result});console.log(JSON.stringify(results.at(-1)));
 }
 if(confirmUpload){await probe('fetch','/api/library/command',4*1024*1024);if(results[0]?.status!==413)report.failure={name:'UnexpectedProbeResult'};}
 else{
 await probe('fetch','/api/library/command',100);
 await probe('fetch','/api/library/command',1024*1024);
 await probe('fetch','/api/library/command',4*1024*1024);
 await probe('playwright','/api/library/command',4*1024*1024);
 await probe('fetch','/api/diary/ingredients/preview',4*1024*1024);
 await probe('fetch','/api/library/command',4*1024*1024,false);
 }
}catch(error){report.failure=safeError(error);}finally{
 await context?.dispose();const clean=async(resource,operation)=>{try{await operation();}catch(error){if(error.code!==404)cleanupFailures.push({resource,...safeError(error)});}};
 if(created){for(const tableId of ['workspace_records','workspace_media','command_receipts']){let rows=[];await clean(tableId+':list',async()=>{rows=await allRows(db,tableId,[Query.equal('ownerId',owner)]);});for(const row of rows)if(row.ownerId===owner)await clean(tableId,()=>db.deleteRow({databaseId,tableId,rowId:row.$id}));}for(const tableId of ['workspace_heads','profiles'])await clean(tableId,()=>db.deleteRow({databaseId,tableId,rowId:owner}));await clean('account',()=>users.delete({userId:owner}));}
 report.fixtureRemoved=cleanupFailures.length===0;writeFileSync(ledger,JSON.stringify({owner,created,removed:report.fixtureRemoved,cleanupFailures}));writeFileSync(confirmUpload?'.local/body-limit-upload-confirmation.json':'.local/body-limit-probe-results.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify({complete:!report.failure,fixtureRemoved:report.fixtureRemoved}));if(report.failure||cleanupFailures.length)process.exitCode=1;
