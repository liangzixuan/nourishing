import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {cloudHomeWidgetView} from '../server/home-widget-view.mjs';
import {beginCloudLogging,finishCloudLogging,loggingCalendar} from '../server/cloud-logging.mjs';
const origin='https://nourishing.example';
const calendar={asOf:'2026-11-15T01:00:00.000Z',timeZone:'America/Chicago',today:'2026-11-14'};
function fixture(){const state=initialState();state.foods=[];state.entries=[];act(state,'food.save',{name:'Fixture',serving:'100 g',grams:100,nutrients:{calories:200,protein:10}});return state;}

test('native cards use the account calendar, original conversion and explicit cloud ownership',()=>{
 const state=fixture();act(state,'entry.add',{foodId:state.foods[0].id,date:'2026-11-14',group:'Dinner',quantity:200,unit:'g'});
 const input={accountId:'fixture-owner',origin,now:new Date(calendar.asOf),timeZone:calendar.timeZone};
 const view=cloudHomeWidgetView(state,input);assert.equal(view.version,3);assert.deepEqual(view.access,{mode:'cloud',origin,accountId:'fixture-owner'});assert.equal(view.calendar.today,'2026-11-14');assert.equal(view.cards.consumed.value,'400 kcal');
 assert.equal(cloudHomeWidgetView(state,{...input,unit:'kJ'}).cards.consumed.value,'1,673.6 kJ');
 assert.ok(!JSON.stringify(view).includes(state.foods[0].id));assert.ok(!JSON.stringify(view).includes('Fixture'));assert.throws(()=>cloudHomeWidgetView(state,{...input,origin:'http://localhost'}));
});
test('logging observes only new current-day records and uses the original ledger for cloud commands',()=>{
 const state=fixture(),before=beginCloudLogging(state,'photo.log');
 act(state,'entry.add',{foodId:state.foods[0].id,date:calendar.today,group:'Dinner',quantity:100,unit:'g'});
 act(state,'entry.add',{foodId:state.foods[0].id,date:'2026-11-13',group:'Dinner',quantity:100,unit:'g'});
 finishCloudLogging(state,before,'photo.log',calendar);assert.equal(state.loggingStreaks.events.length,1);assert.equal(state.loggingStreaks.events[0].day,calendar.today);assert.equal(state.loggingStreaks.events[0].category,'food');
 finishCloudLogging(state,before,'photo.log',calendar);assert.equal(state.loggingStreaks.events.length,1);
 assert.equal(beginCloudLogging(state,'health.import'),null);assert.equal(beginCloudLogging(state,'entry.ingredients.adjust'),null);assert.equal(beginCloudLogging(state,'note.add'),null);
 const metricBefore=beginCloudLogging(state,'biometric.log');state.biometrics.push({id:'native-fixture',date:calendar.today,source:{provider:'health-connect'}});finishCloudLogging(state,metricBefore,'biometric.log',calendar);assert.equal(state.loggingStreaks.events.length,1);
});
test('logging clock keeps supplied server capture and reads only the owning profile otherwise',async()=>{
 const calls=[],db={getRow:async args=>{calls.push(args);return {timeZone:'America/Chicago'};}};
 assert.deepEqual(await loggingCalendar(db,'owner',calendar),calendar);assert.equal(calls.length,0);
 const captured=await loggingCalendar(db,'owner',{});assert.equal(captured.timeZone,'America/Chicago');assert.equal(calls[0].rowId,'owner');
 await assert.rejects(()=>loggingCalendar({getRow:async()=>{throw Object.assign(Error('denied'),{code:403});}},'owner',{}));
});
