import {parseNutrientTargetModes} from './nutrient-target-modes.mjs';
import {date as calendarDate} from './calendar.mjs';
import {catalog,calculateSummary} from './nutrition.mjs';
import {nutrientDisplayOptions,resolveHiddenNutrients} from './nutrient-display.mjs';
import {projectNutrientReferences} from './nutrient-references.mjs';
import {resolveNutrientMaximums} from './nutrient-upper-limits.mjs';
import {parseDiaryDisplayPolicy,defaultDiaryDisplayPolicy} from './diary-display.mjs';
import {parseEnergyUnit} from './energy-units.mjs';
import {nutrientTargetEditors} from './nutrient-target-edit.mjs';

const categories=new Map(catalog.map(row=>[row.id,row.category]));
const defaults=new Map(catalog.map(row=>[row.id,row.target]));
const sections=[
 {id:'general',name:'General',first:['calories','alcohol','ash','betaHydroxybutyrate','caffeine','oxalate','phytate','water']},
 {id:'vitamins',name:'Vitamins',first:[]},
 {id:'minerals',name:'Minerals',first:[]},
 {id:'carbohydrates',name:'Carbohydrates',first:['carbs','netCarbohydrate','fiber','starch','sugar','addedSugar']},
 {id:'lipids',name:'Lipids',first:['fat','saturatedFat','monounsaturatedFat','polyunsaturatedFat']},
 {id:'protein',name:'Protein',first:['protein']},
];
function category(id){
 if(['protein','proteinCorrected','proteinAminoAcids','proteinLabel'].includes(id)||categories.get(id)==='Amino acids')return 'protein';
 if(['carbs','netCarbohydrate'].includes(id))return 'carbohydrates';
 if(id==='fat')return 'lipids';
 return ({Vitamins:'vitamins',Minerals:'minerals',Carbohydrates:'carbohydrates',Lipids:'lipids'})[categories.get(id)]??'general';
}
const saved=(values,id)=>({present:Object.hasOwn(values??{},id),value:values?.[id]??null});

/** Read-only screen projection. Daily values and reference provenance remain owned
 * by nutrition and reference modules; category membership is presentation only.
 */
export function createNutrientTargetsView(state,date){
 calendarDate(date);
 const settings=state.settings??{},modes=parseNutrientTargetModes(settings.nutrientTargetModes).nutrients,summary=calculateSummary(state,date),editors=nutrientTargetEditors(state,date),hidden=new Set(resolveHiddenNutrients(settings.nutrientDisplay));
 const references=new Map(projectNutrientReferences(settings.nutrientReferences,date,settings.nutrientTargetModes).references.map(row=>[row.id,row]));
 const {maximums,projection}=resolveNutrientMaximums(settings.nutrientDisplay,settings.nutrientUpperLimits,settings.nutrientReferences,date,settings.nutrientTargetModes),referenceMaxima=new Map(projection.references.map(row=>[row.id,{...row,origin:'population-ul'}]));
 const display=parseDiaryDisplayPolicy(settings.diaryDisplay)??defaultDiaryDisplayPolicy;
 const rows=nutrientDisplayOptions.map(row=>{
  const stored=saved(settings.targets,row.id),editor=editors.get(row.id),reference=references.get(row.id)??null,maximum=maximums.get(row.id);
  const dailyMode=modes[row.id]?.daily??(reference?.selected?'reference':stored.value!==null||defaults.get(row.id)!=null?'custom':'reference'),maximumMode=modes[row.id]?.maximum??(Object.hasOwn(settings.nutrientDisplay?.maximums??{},row.id)?'custom':dailyMode);
  const governed=['calories','protein','carbs','fat','netCarbohydrate'].includes(row.id)||editor&&editor!=='references';
  return {...row,custom:dailyMode==='custom'||maximumMode==='custom',customEditable:!governed,mixed:dailyMode!==maximumMode,visible:!hidden.has(row.id),dailyTarget:{effective:row.id==='netCarbohydrate'?summary.carbohydrates.net.target:summary.targets[row.id]??null,saved:stored,mode:dailyMode,origin:editor??(stored.present?'saved':defaults.get(row.id)!=null?'sample':'unset'),editor,reference},maximum:{mode:maximumMode,effective:maximum?.maximum??null,saved:saved(settings.nutrientDisplay?.maximums,row.id),reference:referenceMaxima.get(row.id)??null}};
 });
 const groups=sections.map(({id,name,first})=>{const members=rows.filter(row=>category(row.id)===id),byId=new Map(members.map(row=>[row.id,row]));return {id,name,nutrients:[...first.filter(key=>byId.has(key)).map(key=>byId.get(key)),...members.filter(row=>!first.includes(row.id))]};});
 return {version:1,date,energyUnit:parseEnergyUnit(settings.energyUnit??'kcal'),groups,highlighted:[...display.highlighted],showHighlights:display.showHighlights};
}
