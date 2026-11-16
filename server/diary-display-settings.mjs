import {parseDiaryDisplayPolicy} from './domain/diary-display.mjs';
import {scoreDisplayPatch} from './domain/score-display-controls.mjs';
const visibility=['showEnergy','showMacros','showWater'];
export const diaryDisplayCommandFields={'diaryDisplay.save':['diaryDisplay',...visibility],'scoreDisplay.change':['base','change']};
export function prepareDiaryDisplayCommand(state,{type,payload}){
 if(type==='scoreDisplay.change')return {type:'settings.save',payload:scoreDisplayPatch(state.settings,payload)};
 if(!Object.keys(payload).length)throw Object.assign(Error('Choose a display setting.'),{status:400});
 const result={};
 for(const key of visibility)if(Object.hasOwn(payload,key)){if(typeof payload[key]!=='boolean')throw Object.assign(Error('Choose whether to show this panel.'),{status:400});result[key]=payload[key];}
 if(Object.hasOwn(payload,'diaryDisplay'))result.diaryDisplay=parseDiaryDisplayPolicy(payload.diaryDisplay);
 return {type:'settings.save',payload:result};
}
