import {createPrintReportPreview} from './domain/print-report.mjs';
import {diaryTableNutrients} from './domain/diary-display.mjs';
import {parseEnergyUnit} from './domain/energy-units.mjs';
import {parseAppLanguage} from './domain/app-language.mjs';
import {digest} from './data-codec.mjs';

function project(fn){try{return fn();}catch(error){if([400,409].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}}
const presentation=state=>({energyUnit:parseEnergyUnit(state.settings.energyUnit??'kcal'),language:parseAppLanguage(state.settings.appLanguage??'en')});
/** State and clock come from the authenticated workspace reader, never the request. */
export function printReportOptions(state){return project(()=>({revision:digest(state),...presentation(state),charts:(state.charts??[]).map(({id,name})=>({id,name})),diaryColumns:diaryTableNutrients.map(({id,name,unit})=>({id,name,unit}))}));}
export function previewPrintReport(state,input,clock){return project(()=>({revision:digest(state),...presentation(state),capture:createPrintReportPreview(state,input,clock)}));}
