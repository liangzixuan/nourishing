// Actual account/session service and Appwrite transactions; synthetic accounts only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {ID,Query} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';
import {createAppwriteService} from '../server/appwrite-service.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {captureCalendar} from '../server/domain/calendar.mjs';
const {users,db,config}=fixtureOperator(),created=[],pending=[],origin='https://nourishing-cloud.appwrite.network';
const key=JSON.parse(readFileSync('.local/data-key.json','utf8').replace(/^\uFEFF/,''));
const api=createAppwriteService({endpoint:config.endpoint,project:config.projectId,database:databaseId,profileTable:'profiles',origin},key.secret);
const report={at:new Date().toISOString(),checks:[]};
const remember=()=>writeFileSync('.local/native-views-fixture.json',JSON.stringify({created,cleanupFailures:pending}));
let primary;
try{
 const owner=JSON.parse(readFileSync('.local/migration-destination.json')).accountId;
 const original=await db.getRow({databaseId,tableId:'workspace_heads',rowId:owner});
 const sessions=[];
 for(let i=0;i<2;i++){const id=ID.unique();await users.create({userId:id,email:`native-view-${id}@example.com`,password:randomUUID()+'Aa1!',name:'Native view fixture'});created.push(id);remember();sessions.push((await users.createSession({userId:id})).secret);await api.current(sessions[i]);await api.homeWidgets(sessions[i],'kcal');}
 const [secret,other]=sessions,repo=createDataRepository(db,created[0]);
 await api.updateProfile(secret,{timeZone:'America/Chicago',units:'metric'});
 const day=captureCalendar(new Date(),'America/Chicago').today;
 const command=async(type,payload)=>api.workspaceCommand(secret,{requestId:randomUUID(),revision:(await api.targets(secret,day)).revision,type,payload});
 const food=(await command('food.save',{name:'Native fixture',serving:'100 g',grams:100,nutrients:{calories:200,protein:10}})).item.id;
 const input={requestId:randomUUID(),revision:(await api.targets(secret,day)).revision,type:'meal.log',payload:{date:day,group:'Lunch',rows:[{foodId:food,quantity:200,unit:'g'}]}};
 const saved=await api.workspaceCommand(secret,input);assert.deepEqual(await api.workspaceCommand(secret,input),saved);
 let state=await repo.readState();assert.equal(state.entries.length,1);assert.equal(state.loggingStreaks.events.length,1);assert.equal(state.loggingStreaks.events[0].day,day);
 const widget=await api.homeWidgets(secret,'kcal');assert.deepEqual(widget.access,{mode:'cloud',origin,accountId:created[0]});assert.equal(widget.calendar.timeZone,'America/Chicago');assert.equal(widget.cards.consumed.value,'400 kcal');
 assert.equal((await api.homeWidgets(secret,'kJ')).cards.consumed.value,'1,673.6 kJ');
 const otherView=await api.homeWidgets(other,'kcal');assert.equal(otherView.access.accountId,created[1]);assert.notEqual(otherView.cards.consumed.value,widget.cards.consumed.value);
 await assert.rejects(()=>api.homeWidgets('', 'kcal'),error=>error.code===401);
 const parallel=[100,150].map(quantity=>({...input,requestId:randomUUID(),revision:saved.revision,type:'entry.add',payload:{foodId:food,date:day,group:'Lunch',quantity,unit:'g'}}));
 const outcomes=await Promise.allSettled(parallel.map(action=>api.workspaceCommand(secret,action)));assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);assert.equal(outcomes.filter(item=>item.status==='rejected'&&item.reason.code===409).length,1);
 state=await repo.readState();assert.equal(state.entries.length,2);assert.equal(state.loggingStreaks.events.length,2);
 const after=await db.getRow({databaseId,tableId:'workspace_heads',rowId:owner});assert.equal(after.digest,original.digest);assert.equal(after.$updatedAt,original.$updatedAt);
 report.checks=['account-bound widget cards and unit conversion','profile time zone','same-transaction logging ledger','replay does not add a streak event','concurrent losing write leaves no event','second-account isolation','migrated owner unchanged'];
}catch(error){primary=error;}finally{
 const clean=async(label,work)=>{try{await work();}catch(error){if(error.code!==404)pending.push({label,code:error.code});}};
 for(const owner of created){for(const tableId of ['command_receipts','workspace_records','workspace_media']){let rows=[];await clean(tableId+':list',async()=>{rows=await allRows(db,tableId,[Query.equal('ownerId',owner)]);});for(const row of rows)await clean(tableId+':'+row.$id,()=>db.deleteRow({databaseId,tableId,rowId:row.$id}));}for(const tableId of ['workspace_heads','profiles'])await clean(tableId+':'+owner,()=>db.deleteRow({databaseId,tableId,rowId:owner}));await clean('user:'+owner,()=>users.delete({userId:owner}));}
 remember();report.fixtureRemoved=pending.length===0;writeFileSync('.local/native-views-verification.json',JSON.stringify({...report,status:primary||pending.length?'incomplete':'passed'},null,2));
}
if(primary)throw primary;if(pending.length)throw Error('Fixture cleanup incomplete; local ledger retained.');console.log(JSON.stringify({...report,status:'passed'}));
