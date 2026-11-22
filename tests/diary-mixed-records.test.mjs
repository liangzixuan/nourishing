import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {entryFacts,calculateSummary} from '../server/domain/nutrition.mjs';
import {diaryToolsPresentation,diaryToolsReview,applyDiaryToolsCommand} from '../server/diary-tools.mjs';

const date='2026-11-16';
function fixture(){
 const state=initialState();const food=act(state,'food.save',{name:'Rice',serving:'bowl',grams:100,nutrients:{calories:100}});
 for(const time of ['18:00','08:00','08:00',''])act(state,'entry.add',{foodId:food.id,date,group:'Lunch',time,amount:1});
 act(state,'note.add',{date,group:'Lunch',time:'23:00',text:'Lunch note'});
 act(state,'biometric.add',{date,group:'Lunch',time:'01:00',type:'weight',value:70,unit:'kg'});
 act(state,'note.add',{date,text:'Ungrouped note'});
 act(state,'biometric.add',{date,group:null,type:'weight',value:71,unit:'kg'});
 act(state,'note.add',{date,group:'Uncategorized',text:'Explicit category'});
 return state;
}
const project=state=>diaryToolsPresentation(state,{groups:state.settings.groups,entries:state.entries.map(row=>({...row,facts:entryFacts(state,row)})),notes:state.notes,biometrics:state.biometrics,summary:calculateSummary(state,date)});
test('mobile groups preserve default type order and sort all record types chronologically when requested',()=>{
 const state=fixture(),before=structuredClone(state),added=project(state),lunch=view=>view.recordDisplay.groups.find(row=>row.name==='Lunch').records;
 assert.deepEqual(lunch(added).map(ref=>ref.collection),['notes','biometrics','entries','entries','entries','entries']);
 state.settings.diarySort='time';const timed=project(state);
 assert.deepEqual(lunch(timed).map(ref=>ref.id),[state.biometrics[0].id,state.entries[1].id,state.entries[2].id,state.entries[0].id,state.notes[0].id,state.entries[3].id]);
 state.settings.diaryGroupOrder={version:1,groups:[{group:'Lunch',mode:'source'}]};assert.deepEqual(lunch(project(state)),lunch(added));
 assert.equal(timed.consumedEnergy,400);assert.deepEqual(state.entries,before.entries);assert.deepEqual(state.notes,before.notes);assert.deepEqual(state.biometrics,before.biometrics);
});
test('display-only Uncategorized includes missing, null and explicit groups; typed actions preserve identity',()=>{
 const state=fixture();state.notes[1].id=state.biometrics[1].id;
 const before=structuredClone(state),view=project(state),records=view.recordDisplay.groups.find(row=>row.name==='Uncategorized').records;
 assert.equal(records.length,3);assert.equal(new Set(records.map(ref=>JSON.stringify(ref))).size,3);
 const selection={date,scope:'selected',records},review=diaryToolsReview(state,{operation:'copy',selection,destination:{date:'2026-11-17',group:null}});
 applyDiaryToolsCommand(state,{type:'records.copy',payload:{selection:review.selection,destination:review.destination,fingerprint:review.fingerprint,confirmed:true}});
 assert.equal(state.notes.find(row=>row.date==='2026-11-17'&&row.text==='Ungrouped note').group,undefined);
 assert.equal(state.biometrics.find(row=>row.date==='2026-11-17').group,null);
 assert.deepEqual(state.notes.filter(row=>row.date===date),before.notes);assert.deepEqual(state.biometrics.filter(row=>row.date===date),before.biometrics);
 applyDiaryToolsCommand(state,{type:'records.delete',payload:{selection:{date,scope:'selected',records:[{collection:'notes',id:state.notes[1].id}]},confirmed:true}});
 assert.ok(state.biometrics.some(row=>row.id===before.biometrics[1].id));
});
test('group visibility changes presentation only, and hiding group headings keeps every collection visible',()=>{
 const state=fixture();state.settings.diaryGroups={version:1,showGroups:true,hiddenGroups:['Lunch']};
 const hidden=project(state);assert.ok(!hidden.recordDisplay.groups.some(row=>row.name==='Lunch'));assert.equal(hidden.consumedEnergy,400);assert.equal(hidden.entries.length,4);
 state.settings.diaryGroups.showGroups=false;const flat=project(state);assert.equal(flat.recordDisplay.showGroups,false);assert.equal(flat.recordDisplay.groups.flatMap(group=>group.records).length,9);
 const empty=initialState();assert.deepEqual(project(empty).recordDisplay.groups.map(row=>row.name),empty.settings.groups);
});
