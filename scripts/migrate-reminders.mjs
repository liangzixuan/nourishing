// Read-only reminder reconciliation. This script has no apply mode.
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,createReadStream} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {operator,maybeGet} from './operator.mjs';
import {compareReminderSchedules} from '../server/reminder-migration.mjs';
import {digest} from '../server/data-codec.mjs';

try{
 const {values}=parseArgs({options:{manifest:{type:'string'},current:{type:'string'}}});
 if(!values.manifest)throw Error('Supply the approved baseline manifest.');
 const manifestPath=resolve(values.manifest),manifest=JSON.parse(readFileSync(manifestPath,'utf8')),snapshot=join(dirname(manifestPath),'recovery-local-only.sqlite');
 const confirmed=JSON.parse(readFileSync(new URL('../.local/migration-destination.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
 assert.deepEqual(manifest.destination,Object.fromEntries(Object.keys(manifest.destination).map(key=>[key,confirmed[key]])));
 const hash=createHash('sha256');for await(const chunk of createReadStream(snapshot))hash.update(chunk);assert.equal(hash.digest('hex'),manifest.snapshotSha256);
 const source=new DatabaseSync(snapshot,{readOnly:true});let rows;
 try{
  assert.equal(digest(JSON.parse(source.prepare('SELECT body FROM workspace WHERE id=1').get().body)),manifest.workspaceSha256);
  const table=source.prepare("SELECT type FROM sqlite_schema WHERE name='reminder_schedules'").get();if(table&&table.type!=='table')throw Error('Schedule source is not a table.');
  rows=table?source.prepare('SELECT id,payload FROM reminder_schedules LIMIT 25').all():[];
 }finally{source.close();}
 const {db,users,config}=operator();assert.equal(config.projectId,confirmed.projectId);assert.equal(config.endpoint,confirmed.endpoint);
 const account=await users.get({userId:confirmed.accountId});assert.equal(account.email,confirmed.email);assert.equal(account.emailVerification,true);assert.equal(account.status,true);
 const cloudRow=await maybeGet(db,'push_accounts',account.$id),comparison=compareReminderSchedules({rows,cloudRow,ownerId:account.$id});
 let currentPc;
 if(values.current){
  const current=new DatabaseSync(resolve(values.current),{readOnly:true});
  try{const table=current.prepare("SELECT type FROM sqlite_schema WHERE name='reminder_schedules'").get();if(table&&table.type!=='table')throw Error('Current schedule source is not a table.');const currentRows=table?current.prepare('SELECT id,payload FROM reminder_schedules LIMIT 25').all():[];currentPc=compareReminderSchedules({rows:currentRows,cloudRow,ownerId:account.$id});}finally{current.close();}
 }
 const report={mode:'read-only',...comparison,cloudVersion:cloudRow?.version??null,sourceVerified:true,pcCredentialsUploaded:false,...(currentPc?{currentPc}:{})};
 writeFileSync('.local/reminder-migration-review.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){console.error(JSON.stringify({ok:false,status:Number.isInteger(error.code)?error.code:null,message:'Reminder migration did not complete. Check the approved snapshot and account state.'}));process.exitCode=1;}
