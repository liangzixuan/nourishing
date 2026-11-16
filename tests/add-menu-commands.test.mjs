import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../server/domain/workspace.mjs';
import {parseAddMenu} from '../server/domain/add-menu.mjs';
import {applyWorkspaceCommand} from '../server/workspace-commands.mjs';
import {diarySummaryPresentation} from '../server/diary-summary.mjs';
import {calculateSummary} from '../server/domain/nutrition.mjs';

test('Add menu preferences persist through the command boundary and diary projection',()=>{
 const state=initialState(),addMenu=parseAddMenu(null);addMenu.hidden=['voice'];addMenu.swapped=true;addMenu.colors.food='#ff9377';addMenu.order.reverse();
 applyWorkspaceCommand(state,{type:'addMenu.save',payload:{addMenu}});
 assert.deepEqual(state.settings.addMenu,addMenu);
 assert.deepEqual(diarySummaryPresentation(state,calculateSummary(state,'2026-11-15')).settings.addMenu,addMenu);
 for(const payload of [{},{addMenu:{...addMenu,hidden:addMenu.order}},{addMenu:{...addMenu,colors:{food:'url(evil)'}}},{addMenu,ownerId:'other'}]){
  const before=structuredClone(state);assert.throws(()=>applyWorkspaceCommand(state,{type:'addMenu.save',payload}));assert.deepEqual(state,before);
 }
});
