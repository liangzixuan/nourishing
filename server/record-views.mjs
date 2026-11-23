import {diaryGroups} from './domain/diary-groups.mjs';
import {exerciseLimits} from './domain/diary-record-fields.mjs';
import {biometricEntryForPair} from './domain/biometric-library.mjs';
import {digest} from './data-codec.mjs';
import {createBiometricLibrary} from './domain/biometric-library.mjs';
import {resolveExerciseWeight} from './domain/catalog-exercise.mjs';
import {exerciseCatalog} from './domain/exercise-catalog.mjs';
import {estimateExercise} from './domain/exercise-estimate.mjs';
import {readDiaryRecordCorrection} from './domain/diary-record-correction.mjs';
import {diaryDayComplete} from './domain/diary-day-status.mjs';
const invalid=message=>{throw Object.assign(Error(message),{status:400});};
export function recordOptions(state,date){return {revision:digest(state),date,energyUnit:state.settings.energyUnit??'kcal',exerciseLimits,groups:diaryGroups(state.settings.groups),biometrics:createBiometricLibrary(state),exerciseWeight:resolveExerciseWeight(state,date)};}
export function recordView(state,input){
 const result=readDiaryRecordCorrection(state,input);
 return {...result,...(input.collection==='biometrics'?{biometricChoice:biometricEntryForPair(createBiometricLibrary(state),result.record.type,result.record.unit)}:{}),recordRevision:result.revision,revision:digest(state),deletable:!diaryDayComplete(state,result.record.date)};
}
export function exerciseSearch({q='',offset=0}={}){
 if(typeof q!=='string'||q.length>200||!Number.isSafeInteger(offset)||offset<0)invalid('Choose a valid exercise search.');
 const result=exerciseCatalog.search({q}),items=result.items.slice(offset,offset+50);
 return {items,total:result.total,nextOffset:offset+items.length<result.total?offset+items.length:null,edition:result.edition};
}
export function exerciseEstimateView(state,{date,code,minutes}){
 const weight=resolveExerciseWeight(state,date);
 if(weight.status!=='known')throw Object.assign(Error('Set your weight before using an exercise estimate.'),{status:409});
 return {...estimateExercise(exerciseCatalog.get(code),{minutes,weightKg:weight.kilograms}),weightKg:weight.kilograms,weightSource:weight.source};
}

export function exerciseCatalogView(){return exerciseCatalog.search({q:''});}
