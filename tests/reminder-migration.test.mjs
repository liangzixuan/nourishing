import test from 'node:test';
import assert from 'node:assert/strict';
import {compareReminderSchedules} from '../server/reminder-migration.mjs';
const schedule={id:'saved-id',kind:'daily',label:'Lunch',time:'12:00',days:[1,2,3,4,5],timeZone:'America/Chicago',enabled:true,createdAt:'2026-10-15T12:00:00Z'};
const row=value=>({id:value.id,payload:JSON.stringify(value)});
const cloud=state=>({$id:'owner',ownerId:'owner',version:2,$updatedAt:'2026-11-15T12:00:00Z',$permissions:[],payload:JSON.stringify(state)});
test('empty approved baseline and absent cloud preferences require no migration',()=>{
 assert.deepEqual(compareReminderSchedules({rows:[],cloudRow:null,ownerId:'owner'}),{status:'unchanged',sourceSchedules:0,cloudSchedules:0,cloudDevices:0,added:0,changed:0,cloudOnly:0,cloudPaused:true,cloudResumed:false});
});
test('comparison preserves source IDs, validates stored schedules and returns counts only',()=>{
 const rows=[row(schedule)],saved=cloud({devices:[{subscription:{secret:'must-not-be-returned'}}],schedules:[schedule],paused:true,resumedAt:null});
 const before=JSON.stringify({rows,saved}),report=compareReminderSchedules({rows,cloudRow:saved,ownerId:'owner'});
 assert.equal(report.status,'unchanged');assert.equal(report.cloudDevices,1);assert.equal(JSON.stringify({rows,saved}),before);assert.equal(JSON.stringify(report).includes('saved-id'),false);assert.equal(JSON.stringify(report).includes('must-not-be-returned'),false);
});
test('divergent cloud schedules are reported without changing cloud preferences',()=>{
 const saved=cloud({devices:[],schedules:[{...schedule,time:'13:00'},{...schedule,id:'cloud-only'}],paused:false,resumedAt:'2026-11-15T12:00:00Z'}),before=saved.payload;
 const report=compareReminderSchedules({rows:[row(schedule),row({...schedule,id:'source-only'})],cloudRow:saved,ownerId:'owner'});
 assert.equal(report.status,'different');assert.equal(report.added,1);assert.equal(report.changed,1);assert.equal(report.cloudOnly,1);assert.equal(report.cloudPaused,false);assert.equal(saved.payload,before);
});
test('invalid source identity, duplicates, oversized input and foreign cloud ownership fail',()=>{
 for(const rows of [[{id:'wrong',payload:JSON.stringify(schedule)}],[row(schedule),row(schedule)],[{id:'large',payload:' '.repeat(16385)}],Array(25).fill(row(schedule)),[row({...schedule,time:'25:00'})]])assert.throws(()=>compareReminderSchedules({rows,cloudRow:null,ownerId:'owner'}));
 const saved=cloud({devices:[],schedules:[]});saved.ownerId='other';assert.throws(()=>compareReminderSchedules({rows:[],cloudRow:saved,ownerId:'owner'}));
});
