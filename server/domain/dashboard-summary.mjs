import {parseDiaryDisplayPolicy,defaultDiaryDisplayPolicy} from './diary-display.mjs';
import {resolveScoreDisplay} from './nutrition-score-policy.mjs';

export function summaryRows(report,settings,widget){
 const nutrient=id=>id==='netCarbohydrate'?report.carbohydrates.net.summary:report.nutrients.find(row=>row.id===id);
 const macros=[nutrient('protein'),{...report.carbohydrate.summary,name:report.carbohydrate.label,definition:report.carbohydrate.definition},nutrient('fat')].filter(Boolean);
 if(widget==='Nutrition Scores')return {rows:resolveScoreDisplay(settings).selected.map(id=>report.scores.summary.find(row=>row.id===id)).filter(Boolean),scores:true,targets:true};
 if(widget==='Highlighted Nutrients')return {rows:(parseDiaryDisplayPolicy(settings.diaryDisplay)??defaultDiaryDisplayPolicy).highlighted.map(id=>{const row=nutrient(id);return row?{...row,id}:null;}).filter(row=>row&&row.visible!==false),targets:true};
 if(widget==='Macro Targets')return {rows:macros,targets:true};
 const metric=widget==='Expenditure'?'expenditure':widget==='Energy Budget'?'remaining':'consumed';return {rows:macros,energy:report.energy.summary.find(row=>row.id===metric)?.mean??null};
}

const nutritionIds=['calories','protein','fat','fiber','water'];
export function dashboardNutritionCard(report){return {attributions:report.attributions,options:report.options,counts:report.counts,nutrients:nutritionIds.map(id=>report.nutrients.find(row=>row.id===id)),carbohydrate:report.carbohydrate,limitations:report.limitations.map(note=>note.text)};}
