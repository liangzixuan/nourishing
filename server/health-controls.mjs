import {digest} from './data-codec.mjs';
import {act} from './domain/workspace.mjs';
import {createGlucoseTimelineView} from './domain/glucose-timeline.mjs';
import {createCycleView} from './domain/cycle-view.mjs';
import {resolveCycleDisplay} from './domain/cycle-values.mjs';
import {prepareCycleImport,importCycleData,prepareCycleRemoval,removeCycleRecords} from './domain/cycle-records.mjs';
import {invalid} from './request-errors.mjs';

export function glucoseView(state,input,clock){return {revision:digest(state),energyUnit:state.settings.energyUnit??'kcal',language:state.settings.appLanguage??'en',view:createGlucoseTimelineView(state,input,clock)};}
export function cycleView(state,input,clock){return {revision:digest(state),display:resolveCycleDisplay(state.settings?.cycleDisplay),view:createCycleView(state,input,clock)};}
export function diaryCycleDays(state,date,clock){return state.cycleRecords?.length&&resolveCycleDisplay(state.settings?.cycleDisplay).showDiary?createCycleView(state,{from:date,to:date},clock).days:[];}
export function previewCycleImport(state,input){const {writes,...review}=prepareCycleImport(state,input);return {...review,revision:digest(state)};}
export function previewCycleRemoval(state,input){return {...prepareCycleRemoval(state,input),revision:digest(state)};}
export const healthCommandFields={
 'glucose.settings':['policy'],
 'cycle.display':['policy'],
 'cycle.overlay':['chart','enabled'],
 'cycle.import':['data','reviewToken','confirmed'],
 'cycle.remove':['ids','reviewToken','confirmed']
};
export function applyHealthCommand(state,{type,payload}){
 if(!Object.hasOwn(healthCommandFields,type))return {handled:false};
 let result;
 if(type==='glucose.settings'||type==='cycle.display')result=act(state,'settings.save',{[type==='glucose.settings'?'glucoseTimeline':'cycleDisplay']:payload.policy});
 else if(type==='cycle.overlay')result=act(state,type,payload);
 else {
  if(payload.confirmed!==true)invalid('Review and confirm the cycle records.');
  result=type==='cycle.import'?importCycleData(state,payload.data,payload.reviewToken):removeCycleRecords(state,{ids:payload.ids},payload.reviewToken);
 }
 return {handled:true,result};
}
