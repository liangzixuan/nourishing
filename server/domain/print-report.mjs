import {captureReportGuidance,PRINT_REPORT_CAPTURE_VERSION} from './report-guidance.mjs';
import {mergeSourceAttributions} from './catalog-source.mjs';
import {parsePrintDiaryColumn,capturePrintDiaryColumn,projectPrintDiaryValue} from './print-diary-column.mjs';
import {capturePrintProfile} from './print-profile.mjs';
import {parsePrintChartDefinitions} from './print-chart-options.mjs';
import {createNutritionReportCapture,parseNutritionReportOptions} from './nutrition-report.mjs';
import {entryFacts,isExerciseEntry,exerciseEntryFacts} from './nutrition.mjs';
import {orderDiaryEntries,diaryGroupOrders} from './diary-order.mjs';
import {parseChart,metricIdentity,projectMetricSeries,carbohydrateMetricDefinition} from './chart-metrics.mjs';
import {createBloodPressureView} from './blood-pressure.mjs';
import {createGlucoseKetoneView} from './glucose-ketones.mjs';
import {createCycleOverlay,eligibleCycleOverlay,cycleOverlayPrintRows} from './cycle-overlay-capture.mjs';

const MAX_PRINT_BYTES=20000000,sectionNames=['profile','nutrition','diary','biometrics','notes'],macros=['calories','protein','carbs','fat'];
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const capacity=()=>fail('This print preview exceeds the 20,000,000-byte document limit. Narrow the date range or selected sections.');
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value??{},key)).map(key=>[key,value[key]]));
function keys(value,allowed,name){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail(`${name} contains invalid fields.`);}
export function parsePrintReportOptions(input){
  keys(input,['options','sections'],'Print report');const options=parseNutritionReportOptions(input.options),sections=input.sections;keys(sections,[...sectionNames,'bloodPressure','glucoseKetones','chartIds','inlineCharts','diaryColumn'],'Print sections');
  for(const name of sectionNames)if(typeof sections[name]!=='boolean')fail('Choose every print section with true or false.');
  if(Object.hasOwn(sections,'bloodPressure')&&typeof sections.bloodPressure!=='boolean')fail('Choose blood pressure and pulse with true or false.');
  if(Object.hasOwn(sections,'glucoseKetones')&&typeof sections.glucoseKetones!=='boolean')fail('Choose glucose and blood ketones with true or false.');
  if(!Array.isArray(sections.chartIds))fail('Choose saved chart IDs for the print report.');
  const seen=new Set(),chartIds=sections.chartIds.map(id=>{if(typeof id!=='string'||!id.trim()||id.length>1000)fail('Choose a valid saved chart ID.');if(seen.has(id))fail('Choose each saved chart once.');seen.add(id);return id;});
  const inlineCharts=parsePrintChartDefinitions(sections.inlineCharts),diaryColumn=parsePrintDiaryColumn(sections.diaryColumn);
  if(!sectionNames.some(name=>sections[name])&&!sections.bloodPressure&&!sections.glucoseKetones&&!chartIds.length&&!inlineCharts.length)fail('Choose at least one section to print.');
  return {options,sections:{...pick(sections,[...sectionNames,'bloodPressure','glucoseKetones']),chartIds,...(Object.hasOwn(sections,'inlineCharts')?{inlineCharts}:{}),...(Object.hasOwn(sections,'diaryColumn')?{diaryColumn}:{})}};
}
function budgetFor(dto){
  let bytes=Buffer.byteLength(JSON.stringify(dto),'utf8');if(bytes>MAX_PRINT_BYTES)capacity();
  return {push(array,value){const extra=Buffer.byteLength(JSON.stringify(value),'utf8')+(array.length?1:0);if(bytes+extra>MAX_PRINT_BYTES)capacity();bytes+=extra;array.push(value);},finish(){if(Buffer.byteLength(JSON.stringify(dto),'utf8')>MAX_PRINT_BYTES)capacity();}};
}
function diaryRecord(state,row,column){
  const base=pick(row,['date','group','time']);
  if(isExerciseEntry(row)){const facts=exerciseEntryFacts(row);return {...base,name:row.name,kind:'exercise',duration:facts.duration,caloriesBurned:facts.calories};}
  const facts=entryFacts(state,row);
  return {...base,name:facts.name,kind:'food',attributions:facts.attributions,...pick(facts,['amount','quantity','unit','portionLabel','grams']),...(column.mode==='macros'?{nutrients:pick(facts.nutrients,macros),coverage:pick(facts.coverage,macros)}:{column:projectPrintDiaryValue(facts,column.id)})};
}
export function createPrintReportPreview(state,input,clock){
  const {options,sections}=parsePrintReportOptions(input),chartIndex=new Map((state.charts??[]).map(chart=>[chart.id,chart]));
  const chosenCharts=sections.chartIds.map(id=>{const chart=chartIndex.get(id);if(!chart)fail('A selected print chart no longer exists. Choose the sections again.');return parseChart(chart);}).concat((sections.inlineCharts??[]).map((chart,index)=>({...chart,id:`inline-${index+1}`,inline:true})));
  const {report,days}=createNutritionReportCapture(state,options,clock),dto={version:PRINT_REPORT_CAPTURE_VERSION,attributions:[],options,sections,calendar:report.calendar,counts:report.counts,eligibleDates:[],limitations:[...report.limitations]};
  if((sections.bloodPressure||sections.glucoseKetones)&&!sections.profile&&!sections.nutrition&&!sections.diary&&!sections.notes&&!chosenCharts.length){
    dto.limitations=[];
    if(sections.bloodPressure)dto.limitations.push(...captureReportGuidance(['print.pressure']));
    if(sections.glucoseKetones)dto.limitations.push(...captureReportGuidance(['print.glucose']));
    if(sections.biometrics)dto.limitations.push(...captureReportGuidance(['print.biometrics']));
  }
  if(sections.diary&&!sections.profile&&!sections.nutrition&&!sections.notes&&!sections.biometrics&&!sections.bloodPressure&&!sections.glucoseKetones&&!chosenCharts.length)dto.limitations=captureReportGuidance(['print.diaryScope','print.diaryValues','print.exercise']);
  if(sections.profile){
    dto.profile=capturePrintProfile(state,report.calendar);
    if(!sections.nutrition&&!sections.diary&&!sections.notes&&!sections.biometrics&&!sections.bloodPressure&&!sections.glucoseKetones&&!chosenCharts.length)dto.limitations=[];
  }
  if(sections.nutrition)dto.nutrition=pick(report,['attributions','options','calendar','counts','nutrients','carbohydrate','carbohydrates','supplementFilter','energy','balances','scores','dataCompleteness','limitations']);
  if(sections.nutrition||chosenCharts.some(chart=>[chart.primary,chart.secondary].some(metric=>['nutrient','carbohydrate','energy','score','data-completeness'].includes(metric?.kind))))dto.supplementFilter=report.supplementFilter;
  for(const name of ['diary','biometrics','notes'])if(sections[name])dto[name]=[];
  if(sections.diary)dto.diaryColumn=capturePrintDiaryColumn(sections.diaryColumn,state.settings);
  if(chosenCharts.length){dto.charts=[];dto.chartData={dates:[],series:[]};dto.limitations.push(...captureReportGuidance(['print.charts']));}
  const bloodPressure=sections.bloodPressure?createBloodPressureView(state,{from:options.from,to:options.to},{now:new Date(report.calendar.asOf),timeZone:report.calendar.timeZone,eligibleDates:days.map(day=>day.date)}):null;
  if(bloodPressure)dto.bloodPressure={...pick(bloodPressure,['version','range','calendar','mapping','status','counts','rules','cycleOverlayEnabled']),options:[],pairs:[],unmatched:[]};
  const glucoseKetones=sections.glucoseKetones?createGlucoseKetoneView(state,{from:options.from,to:options.to},{now:new Date(report.calendar.asOf),timeZone:report.calendar.timeZone,eligibleDates:days.map(day=>day.date)}):null;
  if(glucoseKetones)dto.glucoseKetones={...pick(glucoseKetones,['version','range','calendar','mapping','status','counts','rules','conversion','cycleOverlayEnabled']),options:[],readings:[],pairs:[],unmatched:[],excluded:[],series:Object.fromEntries(Object.entries(glucoseKetones.series).map(([key,value])=>[key,{unit:value.unit,points:[]}]))};
  const eligible=new Set(days.map(day=>day.date));
  const cycleOverlay=chosenCharts.some(chart=>chart.cycleOverlay===true)?createCycleOverlay(state,{from:options.from,to:options.to},{now:new Date(report.calendar.asOf),timeZone:report.calendar.timeZone}):null;
  if(cycleOverlay){
    dto.chartData.cycleOverlay={...cycleOverlay,observations:[]};
    dto.limitations.push(...captureReportGuidance(['print.cycle']));
  }
  for(const [name,capture]of [['bloodPressure',bloodPressure],['glucoseKetones',glucoseKetones]])if(capture?.cycleOverlay)dto[name].cycleOverlay={...capture.cycleOverlay,observations:[]};
  const budget=budgetFor(dto);
  for(const [name,capture]of [['bloodPressure',bloodPressure],['glucoseKetones',glucoseKetones]])if(capture?.cycleOverlay)for(const row of cycleOverlayPrintRows(capture.cycleOverlay))budget.push(dto[name].cycleOverlay.observations,row);
  if(cycleOverlay)for(const row of cycleOverlayPrintRows(eligibleCycleOverlay(cycleOverlay,eligible)))budget.push(dto.chartData.cycleOverlay.observations,row);

  if(glucoseKetones){
    // The source order identifies even excluded duplicate IDs. Capture-local identities
    // preserve renderer links without exporting private record IDs or diary offsets.
    const orders=[...new Set([...glucoseKetones.readings,...glucoseKetones.excluded.map(item=>item.reading)].map(row=>row.sourceOrder))].sort((a,b)=>a-b),local=new Map(orders.map((order,index)=>[order,{id:`reading-${index+1}`,sourceOrder:index}]));
    const reading=row=>({...pick(row,['date','time','type','unit','value','role','mmolL','displayValue']),...local.get(row.sourceOrder)}),pairIds=new Map();
    for(const row of glucoseKetones.readings)budget.push(dto.glucoseKetones.readings,reading(row));
    for(const pair of glucoseKetones.pairs){const glucose=reading(pair.glucose),ketones=reading(pair.ketones),id=JSON.stringify([glucose.id,ketones.id]);pairIds.set(pair.id,id);budget.push(dto.glucoseKetones.pairs,{...pick(pair,['date','time','match','minutes','gki','reason']),id,glucose,ketones});}
    for(const name of ['unmatched','excluded'])for(const item of glucoseKetones[name])budget.push(dto.glucoseKetones[name],{role:item.role,reading:reading(item.reading),reason:item.reason});
    for(const [role,series]of Object.entries(glucoseKetones.series))for(const point of series.points)budget.push(dto.glucoseKetones.series[role].points,{...pick(point,['date','time','value']),sourceOrder:local.get(point.sourceOrder).sourceOrder,...(role==='gki'?{pairId:pairIds.get(point.pairId)}:{recordId:local.get(point.sourceOrder).id})});
  }
  if(bloodPressure){
    const nativeKeys=new Map();
    const reading=row=>{if(row===null)return null;const result=pick(row,['date','time','type','unit','value']);if(row.nativePressure){const {key,context}=row.nativePressure;if(!nativeKeys.has(key))nativeKeys.set(key,'native-pressure-'+(nativeKeys.size+1));result.nativePressure={key:nativeKeys.get(key),context:{...context}};}return result;};
    for(const pair of bloodPressure.pairs)budget.push(dto.bloodPressure.pairs,{systolic:reading(pair.systolic),diastolic:reading(pair.diastolic),pulse:reading(pair.pulse),...pick(pair,['pressureMatch','pressureMinutes','pulseMatch','pulseMinutes'])});
    for(const item of bloodPressure.unmatched)budget.push(dto.bloodPressure.unmatched,{role:item.role,reading:reading(item.reading),reason:item.reason});
  }
  for(const day of days)budget.push(dto.eligibleDates,pick(day,['date','logged','complete']));
  if(sections.diary){
    const orders=diaryGroupOrders(state.settings);
    const byDate=new Map();for(const row of state.entries??[])if(eligible.has(row.date)){if(!byDate.has(row.date))byDate.set(row.date,[]);byDate.get(row.date).push(row);}
    for(const day of days){
      const rows=byDate.get(day.date)??[],groups=new Map();for(const row of rows){if(!groups.has(row.group))groups.set(row.group,[]);groups.get(row.group).push(row);}
      const groupOrder=[...new Set([...(state.settings?.groups??[]),...groups.keys()])];
      for(const group of groupOrder)for(const row of orderDiaryEntries(groups.get(group)??[],orders.get(group)??state.settings?.diarySort))budget.push(dto.diary,diaryRecord(state,row,dto.diaryColumn));
    }
  }
  if(sections.biometrics)for(const row of state.biometrics??[])if(eligible.has(row.date))budget.push(dto.biometrics,pick(row,['date','time','group','type','value','unit']));
  if(sections.notes)for(const row of state.notes??[])if(eligible.has(row.date))budget.push(dto.notes,pick(row,['date','time','group','text']));
  if(chosenCharts.length){
    const byDate=new Map(days.map(day=>[day.date,day])),start=Date.parse(options.from+'T00:00:00Z'),end=Date.parse(options.to+'T00:00:00Z'),rows=[];
    for(let instant=start;instant<=end;instant+=86400000){const date=new Date(instant).toISOString().slice(0,10);budget.push(dto.chartData.dates,date);rows.push(byDate.get(date)??{date,carbohydrate:{definition:report.carbohydrate.definition,value:null},carbohydrates:Object.fromEntries(['total','net'].map(mode=>[mode,{definition:carbohydrateMetricDefinition(state.settings,{kind:'carbohydrate',mode}),value:null}]))});}
    const seen=new Set();
    for(const chart of chosenCharts){
      for(const metric of [chart.primary,chart.secondary])if(metric!==null){const id=metricIdentity(metric);if(!seen.has(id)){const series=projectMetricSeries(rows,metric);budget.push(dto.chartData.series,series);seen.add(id);}}
      budget.push(dto.charts,{id:chart.id,...(chart.inline?{inline:true}:{}),name:chart.name,primarySeries:metricIdentity(chart.primary),secondarySeries:chart.secondary===null?null:metricIdentity(chart.secondary),...(Object.hasOwn(chart,'cycleOverlay')?{cycleOverlay:chart.cycleOverlay}:{})});
    }
  }
  dto.attributions=mergeSourceAttributions(dto.nutrition?.attributions,...(dto.diary??[]).map(row=>row.attributions),...(dto.chartData?.series??[]).map(series=>series.attributions));
  budget.finish();return dto;
}
