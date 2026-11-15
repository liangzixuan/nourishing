import {createNutrientDetailView} from './domain/nutrient-detail-view.mjs';
import {createReportNutrientDetail} from './domain/report-nutrient-detail.mjs';
import {parseEnergyUnit} from './domain/energy-units.mjs';
import {parseAppLanguage} from './domain/app-language.mjs';
import {digest} from './data-codec.mjs';

function project(fn){try{return fn();}catch(error){if([400,409].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}}
const presentation=state=>({revision:digest(state),energyUnit:parseEnergyUnit(state.settings.energyUnit??'kcal'),language:parseAppLanguage(state.settings.appLanguage??'en')});
/** Read one authenticated workspace snapshot; source owners retain all arithmetic. */
export function nutrientDetail(state,input){return project(()=>({...createNutrientDetailView(state,input),...presentation(state)}));}
export function reportNutrientDetail(state,input,clock){return project(()=>({...createReportNutrientDetail(state,input,clock),...presentation(state)}));}
