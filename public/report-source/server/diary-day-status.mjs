/** Completion freezes manual diary records, not source imports or library facts. */
export function diaryDayComplete(state,date){return (state.settings?.completedDays??[]).includes(date);}
export function completedDiaryMessage(date){return `The diary for ${date} is complete. Reopen that day before changing its records.`;}
export function assertDiaryDaysEditable(state,dates){
  for(const date of new Set(dates))if(diaryDayComplete(state,date))throw Object.assign(new Error(completedDiaryMessage(date)),{status:409,code:'DIARY_DAY_COMPLETE'});
}
