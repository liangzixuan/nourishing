import {uiText} from './compact-ui.js';

// Empty recorded scopes have no contributions. This is a display total, not a
// claim that an unfinished day has complete intake or that a food has no energy.
export function diaryRecordedAmount(row){
  return row.active && row.value===null && row.coverage.total===0 && row.coverage.complete ? 0 : row.value;
}
export function diaryAmountName(row,energyUnit='kcal',language='en',name=row.name){
  return row.id==='calories' && energyUnit==='kcal' ? uiText('calories',language) : name;
}
