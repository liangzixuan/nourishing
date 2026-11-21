import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../server/domain/workspace.mjs';
import {diaryCalendarView} from '../server/diary-calendar-view.mjs';
import {defaultDiaryCalendar} from '../server/domain/diary-calendar.mjs';
import {createWebHandler} from '../server/http.mjs';
const context={now:new Date('2026-11-16T18:00:00Z'),timeZone:'America/Chicago'};
test('Diary calendar projects bounded presence and completed days using account fasting boundaries',()=>{
 const state=initialState();state.entries=[{id:'a',date:'2026-11-01'},{id:'b',date:'2026-11-01',kind:'exercise'},{id:'c',date:'2026-10-31'}];state.notes=[{date:'2026-11-01'}];state.biometrics=[{date:'2026-11-01'}];state.fasts=[{start:'2026-11-01T04:30:00Z',end:'2026-11-01T06:00:00Z'},{start:'2026-11-16T17:00:00Z',end:null}];state.settings.completedDays=['2026-10-31','2026-11-01','2026-12-01'];
 const before=structuredClone(state),view=diaryCalendarView(state,{month:'2026-11'},context);assert.deepEqual(view.markers['2026-11-01'],['food','exercise','biometric','note','fast']);assert.deepEqual(view.markers['2026-11-16'],['fast']);assert.equal(view.markers['2026-10-31'],undefined);assert.deepEqual(view.completedDays,['2026-11-01']);assert.deepEqual(view.loggedDays,['2026-11-01']);assert.equal(view.calendar.today,'2026-11-16');assert.deepEqual(state,before);assert.equal('entries' in view,false);
 state.settings.diaryCalendar={...defaultDiaryCalendar,food:false,fast:false};const hidden=diaryCalendarView(state,{month:'2026-11'},context);assert.deepEqual(hidden.markers['2026-11-01'],['exercise','biometric','note']);assert.equal(hidden.markers['2026-11-16'],undefined);assert.notEqual(hidden.revision,view.revision);
 state.settings.diaryCalendar={version:1,food:false,exercise:false,biometric:false,note:false,fast:false};const disabled=diaryCalendarView(state,{month:'2026-11'},context);assert.deepEqual(disabled.markers,{});assert.deepEqual(disabled.loggedDays,['2026-11-01']);
 for(const input of [{month:'2026-13'},{month:'2026-1'},{month:'2026-02',owner:'other'},{}])assert.throws(()=>diaryCalendarView(state,input,context),{status:400});assert.equal(diaryCalendarView(state,{month:'2024-02'},context).month,'2024-02');assert.deepEqual(diaryCalendarView(initialState(),{month:'2026-11'},context).markers,{});
});
test('Calendar route rejects unauthenticated and caller-selected scopes and reads only the authenticated account',async()=>{
 const states={one:initialState(),two:initialState()},calls=[];states.one.notes=[{date:'2026-11-01'}];const origin='https://calendar.example',handler=createWebHandler({config:{origin},service:{diaryCalendar:async(secret,input)=>{calls.push([secret,input]);return diaryCalendarView(states[secret],input,context);}}});const get=(query,secret)=>handler(new Request(origin+'/api/diary/calendar'+query,{headers:secret?{cookie:'__Host-nourishing_session='+secret}:{}}));
 assert.equal((await get('?month=2026-11')).status,401);for(const query of ['?month=2026-11&owner=two','?month=2026-11&month=2026-12',''])assert.equal((await get(query,'one')).status,400);assert.deepEqual(calls,[]);
 const response=await get('?month=2026-11','one');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual((await response.json()).markers,{'2026-11-01':['note']});assert.deepEqual((await (await get('?month=2026-11','two')).json()).markers,{});
});
