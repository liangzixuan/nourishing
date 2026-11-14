import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../server/domain/workspace.mjs';
import {applyDiaryCommand,parseCommand} from '../server/diary-commands.mjs';
const food={id:'test:food',name:'Measured food',grams:100,serving:'100 g',nutrients:{calories:100,protein:10}};
const add={type:'entry.add',payload:{foodId:food.id,date:'2026-11-14',time:'12:00',group:'Lunch',quantity:150,unit:'g'}};
test('diary commands use source quantities, preserve unknown nutrients, and support edit/delete',()=>{
 const state=initialState();state.foods.push(food);
 applyDiaryCommand(state,add);const id=state.entries[0].id;assert.equal(state.entries[0].quantity,150);assert.equal(state.entries[0].amount,undefined);assert.equal(state.entries[0].nutrients,undefined);
 applyDiaryCommand(state,{type:'entry.update',payload:{id,quantity:50,unit:'g'}});assert.equal(state.entries[0].quantity,50);
 applyDiaryCommand(state,{type:'entry.delete',payload:{id}});assert.equal(state.entries.length,0);
});
test('command boundary rejects arbitrary ownership, injected nutrition, invalid food, dates and groups',()=>{
 const state=initialState();state.foods.push(food);
 for(const input of [{...add,ownerId:'other'},{...add,payload:{...add.payload,nutrients:{calories:0}}},{...add,payload:{...add.payload,foodId:'missing'}},{...add,payload:{...add.payload,date:'2026-02-30'}},{...add,payload:{...add.payload,group:'invented'}},{type:'profile.update',payload:{}}])assert.throws(()=>applyDiaryCommand(structuredClone(state),input));
 assert.throws(()=>parseCommand({requestId:'bad',revision:'bad',...add}));
 assert.throws(()=>parseCommand({requestId:['request-1234567890'],revision:'a'.repeat(64),...add}));
 assert.equal(initialState().foods.length,0);assert.equal(initialState().notes.length,0);
});
test('completed days block editing until reopened',()=>{
 const state=initialState();state.foods.push(food);applyDiaryCommand(state,add);
 applyDiaryCommand(state,{type:'day.complete',payload:{date:'2026-11-14',completed:true}});
 assert.throws(()=>applyDiaryCommand(state,{type:'entry.delete',payload:{id:state.entries[0].id}}));
 applyDiaryCommand(state,{type:'day.complete',payload:{date:'2026-11-14',completed:false}});
 applyDiaryCommand(state,{type:'entry.delete',payload:{id:state.entries[0].id}});assert.equal(state.entries.length,0);
});
