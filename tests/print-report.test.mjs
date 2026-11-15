import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {createPrintReportPreview} from '../server/domain/print-report.mjs';
import {previewPrintReport,printReportOptions} from '../server/print-report.mjs';
import {renderPrintDocument} from '../public/report-source/renderer.js';
const date='2026-11-14',clock={now:new Date('2026-11-15T02:00:00Z'),timeZone:'America/Chicago'};
const input=()=>({options:{from:date,to:date,dayFilter:'all',includeToday:true,includeSupplements:true},sections:{profile:false,nutrition:true,diary:true,biometrics:false,notes:true,bloodPressure:false,glucoseKetones:false,chartIds:[],diaryColumn:{mode:'macros'}}});
function fixture(){const state=initialState();state.foods.push({id:'print-food',name:'Food <script>test</script>',serving:'100 g',grams:100,nutrients:{calories:200,protein:12},source:{name:'Fixture source',attribution:'Fixture public source credit'}});act(state,'entry.add',{date,foodId:'print-food',quantity:50,unit:'g',group:'Lunch'});act(state,'note.add',{date,text:'Private note <img src=x onerror=alert(1)>'});return state;}
test('print preview preserves the source capture, source unknowns and account time zone without writes',()=>{
 const state=fixture(),before=structuredClone(state),request=input(),result=previewPrintReport(state,request,clock);
 assert.deepEqual(result.capture,createPrintReportPreview(state,request,clock));assert.deepEqual(state,before);
 assert.equal(result.capture.diary[0].nutrients.calories,100);assert.equal(result.capture.diary[0].nutrients.fat,null);
 assert.equal(result.capture.calendar.today,date);
 assert.deepEqual(result.capture.attributions,['Fixture public source credit']);
 const excluded=previewPrintReport(state,{...request,options:{...request.options,includeToday:false}},clock);assert.equal(excluded.capture.counts.eligibleDays,0);
 assert.equal(previewPrintReport(state,{...request,options:{...request.options,includeToday:false}},{...clock,timeZone:'UTC'}).capture.counts.eligibleDays,1);
});
test('account state owns charts, units and language; foreign and malformed selections fail',()=>{
 const state=fixture();state.settings.energyUnit='kJ';state.settings.appLanguage='fr';
 const options=printReportOptions(state);assert.equal(options.energyUnit,'kJ');assert.equal(options.language,'fr');assert.ok(options.diaryColumns.length>5);
 assert.throws(()=>previewPrintReport(state,{...input(),ownerId:'someone'},clock),{code:400});
 assert.throws(()=>previewPrintReport(state,{...input(),sections:{...input().sections,chartIds:['foreign-chart']}},clock),{code:400});
 const other=initialState();assert.equal(previewPrintReport(other,input(),clock).capture.diary.length,0);
});
test('original report renderer retains captured data, escapes private text and supports localized units',()=>{
 const state=fixture(),capture=previewPrintReport(state,input(),clock).capture;
 const english=renderPrintDocument(capture,{energyUnit:'kcal',language:'en'}),french=renderPrintDocument(capture,{energyUnit:'kJ',language:'fr'});
 assert.match(english,/Food &lt;script&gt;test&lt;\/script&gt;/);assert.doesNotMatch(english,/<script>|<img src=x/);assert.match(english,/Unknown/);
 assert.match(french,/lang="fr"/);assert.match(french,/kJ/);assert.notEqual(english,french);
 state.entries=[];state.notes=[];assert.equal(renderPrintDocument(capture,{energyUnit:'kcal',language:'en'}),english);
});
