import {calculateSummary,entryFacts} from './domain/nutrition.mjs';
import {diarySummaryPresentation} from './diary-summary.mjs';
import {diaryToolsPresentation} from './diary-presentation.mjs';

/** Shared diary projection; transport owns revision and captured cycle metadata. */
export function projectLocalDiary(state,date,template={},clock={now:new Date()}){
 const summary=calculateSummary(state,date);
 return diaryToolsPresentation(state,{
  ...template,date,cycleDays:template.date===date?template.cycleDays:[],
  theme:state.settings.theme??'dark',groups:[...state.settings.groups],
  completed:state.settings.completedDays?.includes(date)??false,
  entries:state.entries.filter(row=>row.date===date).map(row=>({...row,facts:entryFacts(state,row)})),
  biometrics:state.biometrics.filter(row=>row.date===date),notes:state.notes.filter(row=>row.date===date),
  summary,presentation:diarySummaryPresentation(state,summary,clock),
 });
}

export {projectProfileSettings} from './profile-settings-view.mjs';
export {applyProfileSettingsProjection} from './domain/profile-settings-command.mjs';
export {projectDiaryCalendar} from './domain/diary-calendar.mjs';
