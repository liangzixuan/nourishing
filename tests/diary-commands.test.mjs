import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../server/domain/workspace.mjs';
import {applyWorkspaceCommand,parseCommand} from '../server/workspace-commands.mjs';
const food={id:'test:food',name:'Measured food',grams:100,serving:'100 g',nutrients:{calories:100,protein:10}};
const add={type:'entry.add',payload:{foodId:food.id,date:'2026-11-14',time:'12:00',group:'Lunch',quantity:150,unit:'g'}};
test('online water logging uses the command boundary and canonical record limits',()=>{
 const state=initialState(),input={requestId:'water-request-1234567890',revision:'a'.repeat(64),type:'water.add',payload:{date:'2026-11-14',time:'12:00',amount:250}};
 parseCommand(input);applyWorkspaceCommand(state,{type:input.type,payload:input.payload});
 assert.deepEqual(state.biometrics.map(({date,time,type,value,unit})=>({date,time,type,value,unit})),[{date:'2026-11-14',time:'12:00',type:'Water',value:250,unit:'mL'}]);
 for(const payload of [{...input.payload,amount:0},{...input.payload,amount:20001},{...input.payload,date:'2026-02-30'},{...input.payload,time:'25:00'},{...input.payload,ownerId:'other'}]){
  const before=structuredClone(state);assert.throws(()=>{parseCommand({...input,payload});applyWorkspaceCommand(state,{type:input.type,payload});});assert.deepEqual(state,before);
 }
 applyWorkspaceCommand(state,{type:'day.complete',payload:{date:input.payload.date,completed:true}});
 assert.throws(()=>applyWorkspaceCommand(state,{type:input.type,payload:input.payload}));
});
test('diary commands use source quantities, preserve unknown nutrients, and support edit/delete',()=>{
 const state=initialState();state.foods.push(food);
 applyWorkspaceCommand(state,add);const id=state.entries[0].id;assert.equal(state.entries[0].quantity,150);assert.equal(state.entries[0].amount,undefined);assert.equal(state.entries[0].nutrients,undefined);
 applyWorkspaceCommand(state,{type:'entry.update',payload:{id,quantity:50,unit:'g'}});assert.equal(state.entries[0].quantity,50);
 applyWorkspaceCommand(state,{type:'entry.delete',payload:{id}});assert.equal(state.entries.length,0);
});
test('command boundary rejects arbitrary ownership, injected nutrition, invalid food, dates and groups',()=>{
 const state=initialState();state.foods.push(food);
 for(const input of [{...add,ownerId:'other'},{...add,payload:{...add.payload,nutrients:{calories:0}}},{...add,payload:{...add.payload,foodId:'missing'}},{...add,payload:{...add.payload,date:'2026-02-30'}},{...add,payload:{...add.payload,group:'invented'}},{type:'profile.update',payload:{}}])assert.throws(()=>applyWorkspaceCommand(structuredClone(state),input));
 assert.throws(()=>parseCommand({requestId:'bad',revision:'bad',...add}));
 assert.throws(()=>parseCommand({requestId:['request-1234567890'],revision:'a'.repeat(64),...add}));
 assert.equal(initialState().foods.length,0);assert.equal(initialState().notes.length,0);
});
test('completed days block editing until reopened',()=>{
 const state=initialState();state.foods.push(food);applyWorkspaceCommand(state,add);
 applyWorkspaceCommand(state,{type:'day.complete',payload:{date:'2026-11-14',completed:true}});
 assert.throws(()=>applyWorkspaceCommand(state,{type:'entry.delete',payload:{id:state.entries[0].id}}));
 applyWorkspaceCommand(state,{type:'day.complete',payload:{date:'2026-11-14',completed:false}});
 applyWorkspaceCommand(state,{type:'entry.delete',payload:{id:state.entries[0].id}});assert.equal(state.entries.length,0);
});
