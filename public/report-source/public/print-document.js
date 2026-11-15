import {CaptureValidationError} from './capture-errors.js';
import {chartSeriesDescription} from './chart-description.js';
import {formatMessage} from './message-format.js';
import {reportMessage,reportReason} from './report-labels.js';
import {carbohydrateControlDescription,carbohydrateDisplayLabel,carbohydrateReasonText} from './carbohydrate-description.js';
import {isReportGuidance,PRINT_REPORT_CAPTURE_VERSION} from './../server/report-guidance.mjs';
import {reportNoteText} from './report-guidance.js';
import {appendBalancePrint} from './balance-print.js';
import {metricDisplayName} from './metric-language.js';
import {nutrientDisplayName,nutrientGroupName} from './nutrient-language.js';
import {validateSourceAttributions} from './../server/catalog-source.mjs';
import {renderSourceAttributions} from './source-attribution.js';
import {isQuantityUnit} from './../server/quantity-units.mjs';
import {validatePrintDiaryColumn,printDiaryColumnDescription} from './../server/print-diary-column.mjs';
import {validatePrintProfile,printProfileLabels,printProfileNote} from './print-profile.js';
import {parsePrintChartDefinitions} from './../server/print-chart-options.mjs';
import {validateCarbohydrateReport} from './../server/carbohydrate-report.mjs';
import {displayValue,displayUnit} from './energy-display.js';
import {parseEnergyUnit} from './../server/energy-units.mjs';
import {maximumReportText,validateMaximumReport} from './nutrient-maximum-report.js';
import {validateDataCompletenessReport,renderDataCompletenessReport} from './data-completeness-report.js';
import {renderScoreReport,validateScoreReport} from './score-report.js';
import {validateNutrientBalanceView} from './nutrient-balance-view.js';
import {energyReportFragments,validateEnergyCapture} from './energy-report.js';
import {renderChart,chartDisplayUnit} from './chart-renderer.js';
import {validateCycleOverlay} from './../server/cycle-overlay.mjs';
import {renderBloodPressureCapture,BLOOD_PRESSURE_PRINT_CSS} from './blood-pressure-renderer.js';
import {renderGlucoseKetoneCapture,validateGlucoseKetoneCapture,GLUCOSE_KETONES_PRINT_CSS} from './glucose-ketones-renderer.js';

export const PRINT_DOCUMENT_BYTE_LIMIT=20000000;
const capacity=()=>{throw new CaptureValidationError('printCapacity');};
const invalid=()=>{throw new CaptureValidationError('printIncomplete');};
const encoder=new TextEncoder(),escaped={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
class Html{
  constructor(){this.parts=[];this.bytes=0;}
  raw(value){const bytes=encoder.encode(value).length;if(this.bytes+bytes>PRINT_DOCUMENT_BYTE_LIMIT)capacity();this.bytes+=bytes;this.parts.push(value);}
  text(value){let part='';for(const char of String(value??'')){const fragment=escaped[char]||char,code=char.codePointAt(0),bytes=escaped[char]?fragment.length:code<=127?1:code<=2047?2:code<=65535?3:4;if(this.bytes+bytes>PRINT_DOCUMENT_BYTE_LIMIT)capacity();this.bytes+=bytes;part+=fragment;if(part.length>=4096){this.parts.push(part);part='';}}if(part)this.parts.push(part);}
  finish(){return this.parts.join('');}
}
const css=m=>`@page{size:A4;margin:14mm;@bottom-left{content:${JSON.stringify(m('footer'))};font-family:Arial,sans-serif;font-size:8pt;color:#465e50}@bottom-right{content:${JSON.stringify(m('page'))} counter(page) ${JSON.stringify(m('of'))} counter(pages);font-family:Arial,sans-serif;font-size:8pt;color:#465e50}}*{box-sizing:border-box}html{font-family:Arial,"Segoe UI",sans-serif;color:#172c23;background:white}body{margin:0;font-size:10pt;line-height:1.4}h1{font-size:21pt;margin:0 0 5mm;overflow-wrap:anywhere}h2{font-size:14pt;margin:8mm 0 3mm;break-after:avoid;page-break-after:avoid}h3{font-size:11pt;margin:4mm 0 2mm;break-after:avoid}p{margin:2mm 0;orphans:3;widows:3}.capture,.method,.notice{font-size:9pt;color:#344d40}.capture{padding-bottom:4mm;border-bottom:1px solid #bdcbbf}.method{margin:3mm 0}.notice{padding:3mm;border-left:2px solid #698d65;background:#f4f7f2}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:3mm 0 5mm;font-size:9pt}thead{display:table-header-group}tfoot{display:table-footer-group}th,td{text-align:left;vertical-align:top;padding:2mm;border:1px solid #cbd5cc;overflow-wrap:anywhere}th{font-weight:600;background:#eef3ec}tr{break-inside:avoid;page-break-inside:avoid}.nutrients th:first-child{width:24%}.nutrients th:last-child{width:22%}.profile small,.nutrients small,.detail small{display:block;color:#465e50;font-size:8pt;margin-top:1mm}.diary th:nth-child(1){width:14%}.diary th:nth-child(2){width:25%}.diary th:nth-child(3){width:27%}.diary th:nth-child(4){width:34%}.source-number{display:inline-block;white-space:nowrap}.nutrient-detail{margin:0 0 1mm}.nutrient-detail:last-child{margin-bottom:0}.coverage{font-size:8pt;color:#465e50}.biometrics th:nth-child(1){width:17%}.biometrics th:nth-child(2){width:10%}.biometrics th:nth-child(3){width:17%}.biometrics th:nth-child(4){width:25%}.biometrics th:nth-child(5){width:19%}.biometrics th:nth-child(6){width:12%}.profile th:first-child{width:28%}.energy-daily{font-size:8pt}.energy-daily>tbody.energy-day{break-inside:avoid;page-break-inside:avoid}.energy-daily th:first-child{width:16%}.energy-basis p{font-size:8pt;margin:1mm 0}.energy-limitations{font-size:9pt}.notes .note{break-inside:auto;margin-bottom:5mm}.notes .note-text{white-space:pre-wrap;overflow-wrap:anywhere;break-inside:auto;orphans:3;widows:3}.chart-block{break-inside:avoid;page-break-inside:avoid;margin:5mm 0 7mm}.chart{display:block;width:100%;height:auto;aspect-ratio:680/225}.chart text{font-size:12px}.chart-legend{font-size:9pt;margin:2mm 0}.chart-review-required,.empty{font-size:10pt;padding:3mm;border:1px solid #cbd5cc}.limitations{break-inside:avoid;page-break-inside:avoid;font-size:9pt;line-height:1.5;padding-left:5mm}.section-label{font-size:9pt;color:#465e50}.balance-print-card{margin:4mm 0 7mm;overflow-wrap:anywhere}.balance-print-heading{break-inside:avoid;page-break-inside:avoid;break-after:avoid;page-break-after:avoid}.balance-print-card h3{margin:3mm 0 1mm}.balance-print-card .balance-print-value{font-size:13pt;font-weight:600}.balance-print-card p{font-size:9pt}.balance-print-inputs{font-size:8pt;margin-top:2mm}.balance-print-inputs th:first-child{width:23%}.balance-print-inputs th:nth-child(2){width:23%}.balance-print-inputs th:nth-child(3){width:13%}.balance-print-inputs td,.balance-print-inputs th{padding:1.7mm}.balance-print-inputs small{display:block;font-size:7.5pt;margin-top:1mm}.balance-print-sources{font-size:8pt;overflow-wrap:anywhere}.balance-print-formula{font-size:8pt;overflow-wrap:anywhere}.balance-print-method{font-size:9pt} @media screen{body{padding:16px;max-width:900px;margin:auto}.document-scroll{overflow-x:auto}table{min-width:600px}}`;

const printNumber=(value,m)=>Number.isFinite(value)?Number(value).toLocaleString('en-US',{maximumFractionDigits:4}):m('unknown');
const sourceNumber=(value,m)=>typeof value==='number'&&Number.isFinite(value)?String(value):m('unknown');
function element(html,tag,value){html.raw('<'+tag+'>');html.text(value);html.raw('</'+tag+'>');}
function cell(html,value,tag='td'){element(html,tag,value);}

function sourceValue(html,value,m){html.raw('<span class="source-number" data-source-number>');html.text(sourceNumber(value,m));html.raw('</span>');}
function validate(dto,language){
  if(!dto||dto.version!==PRINT_REPORT_CAPTURE_VERSION||!dto.options||!dto.sections||!dto.calendar||!dto.counts||!Array.isArray(dto.eligibleDates)||!Array.isArray(dto.limitations)||!dto.limitations.every(isReportGuidance)||Object.keys(dto).some(key=>!['version','options','sections','calendar','counts','eligibleDates','limitations','attributions','profile','nutrition','diary','biometrics','notes','bloodPressure','glucoseKetones','charts','chartData','supplementFilter','diaryColumn'].includes(key)))invalid();
  validateSourceAttributions(dto.attributions);
  if(typeof dto.options.includeSupplements!=='boolean')invalid();
  const needsFilter=dto.sections.nutrition===true||dto.chartData?.series?.some(series=>['nutrient','carbohydrate','energy','score','data-completeness'].includes(series.metric?.kind));
  if(Object.hasOwn(dto,'supplementFilter')!==Boolean(needsFilter))invalid();
  if(needsFilter){const value=dto.supplementFilter,keys=['includedFoodContributions','includedSupplementContributions','includedUnclassifiedContributions','excludedSupplementContributions','filteredEmptyDays'];if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Number.isSafeInteger(value[key])||value[key]<0))invalid();}
  for(const name of ['profile','nutrition','diary','biometrics','notes']){if(typeof dto.sections[name]!=='boolean'||Object.hasOwn(dto,name)!==dto.sections[name])invalid();if(dto.sections[name]&&['diary','biometrics','notes'].includes(name)&&!Array.isArray(dto[name]))invalid();}
  if(Object.hasOwn(dto,'diaryColumn')!==dto.sections.diary)invalid();if(dto.sections.diary)validatePrintDiaryColumn(dto.diaryColumn,dto.sections.diaryColumn,dto.diary);
  if(Object.hasOwn(dto.sections,'bloodPressure')&&typeof dto.sections.bloodPressure!=='boolean'||Object.hasOwn(dto,'bloodPressure')!==(dto.sections.bloodPressure===true))invalid();
  if(dto.sections.bloodPressure&&(!dto.bloodPressure?.calendar||['asOf','timeZone','today'].some(key=>dto.bloodPressure.calendar[key]!==dto.calendar[key])||dto.bloodPressure.range?.from!==dto.options.from||dto.bloodPressure.range?.to!==dto.options.to))invalid();
  if(Object.hasOwn(dto.sections,'glucoseKetones')&&typeof dto.sections.glucoseKetones!=='boolean'||Object.hasOwn(dto,'glucoseKetones')!==(dto.sections.glucoseKetones===true))invalid();
  if(dto.sections.glucoseKetones){if(!dto.glucoseKetones?.calendar||['asOf','timeZone','today'].some(key=>dto.glucoseKetones.calendar[key]!==dto.calendar[key])||dto.glucoseKetones.range?.from!==dto.options.from||dto.glucoseKetones.range?.to!==dto.options.to)invalid();validateGlucoseKetoneCapture(dto.glucoseKetones,language);}
  if(!Array.isArray(dto.sections.chartIds))invalid();const inline=parsePrintChartDefinitions(dto.sections.inlineCharts),savedCount=dto.sections.chartIds.length,charts=savedCount+inline.length>0;
  if(Object.hasOwn(dto,'charts')!==charts||Object.hasOwn(dto,'chartData')!==charts)invalid();
  if(charts){
    if(!Array.isArray(dto.charts)||!dto.chartData||!Array.isArray(dto.chartData.dates)||!Array.isArray(dto.chartData.series)||dto.charts.length!==savedCount+inline.length)invalid();
    for(const [index,chart]of dto.charts.entries()){
      if(index<savedCount){if(chart.id!==dto.sections.chartIds[index]||Object.hasOwn(chart,'inline'))invalid();}
      else{const selected=inline[index-savedCount];if(chart.inline!==true||chart.id!==`inline-${index-savedCount+1}`||chart.name!==selected.name||chart.primarySeries!==JSON.stringify(selected.primary)||chart.secondarySeries!==(selected.secondary===null?null:JSON.stringify(selected.secondary))||chart.cycleOverlay!==selected.cycleOverlay)invalid();}
    }
  }
  for(const name of ['bloodPressure','glucoseKetones'])if(dto[name]?.cycleOverlay){const eligible=new Set(dto.eligibleDates.map(day=>day.date));if(dto[name].cycleOverlay.observations.some(row=>!eligible.has(row.date)))invalid();}
  if(charts){
    if(dto.charts.some(chart=>Object.hasOwn(chart,'cycleOverlay')&&typeof chart.cycleOverlay!=='boolean'))invalid();
    const enabled=dto.charts.some(chart=>chart.cycleOverlay===true);
    if(Object.hasOwn(dto.chartData,'cycleOverlay')!==enabled)invalid();
    if(enabled){
      const capture=dto.chartData.cycleOverlay,eligible=new Set(dto.eligibleDates.map(day=>day.date));
      validateCycleOverlay(capture,{from:dto.options.from,to:dto.options.to});
      if(['asOf','timeZone','today'].some(key=>capture.calendar[key]!==dto.calendar[key])||capture.observations.some(row=>!eligible.has(row.date)))invalid();
    }
  }
  if(dto.sections.nutrition){if(!Array.isArray(dto.nutrition?.nutrients)||!Array.isArray(dto.nutrition.limitations)||!dto.nutrition.limitations.every(isReportGuidance))invalid();validateDataCompletenessReport(dto.nutrition.dataCompleteness,{eligibleDays:dto.counts.eligibleDays});validateScoreReport(dto.nutrition.scores,{dates:dto.eligibleDates.map(day=>day.date),eligibleDays:dto.counts.eligibleDays});validateNutrientBalanceView(dto.nutrition.balances,{scope:'period',from:dto.options.from,to:dto.options.to});if([...dto.nutrition.balances.pairs,dto.nutrition.balances.pral,dto.nutrition.balances.calciumAbsorption].some(row=>row.days.eligible!==dto.counts.eligibleDays))invalid();validateEnergyCapture(dto.nutrition.energy);validateCarbohydrateReport(dto.nutrition.carbohydrates,{eligibleDays:dto.counts.eligibleDays,tracked:dto.nutrition.carbohydrate});for(const row of [...dto.nutrition.nutrients,...Object.values(dto.nutrition.carbohydrates).map(c=>c.summary)])validateMaximumReport(row);}if(dto.sections.profile)validatePrintProfile(dto.profile,dto.calendar);
}



/** Build a standalone, script-free selected document. Escape and charge text
 * incrementally before storing fragments or joining the bounded document. */

function diaryColumnCell(html,row,column,energyUnit,m){
 const number=value=>printNumber(value,m);
 if(column.mode==='macros'){if(row.kind==='exercise'){html.raw('<strong>');html.text(m('energyBurned')+' '+energyUnit+': ');html.raw('</strong><span class="source-number" data-print-energy>');html.text(sourceNumber(displayValue(row.caloriesBurned,'kcal',energyUnit),m));html.raw('</span>');}else for(const [key,label]of [['calories',m('energy')+' '+energyUnit],['protein',m('protein')+' g'],['carbs',m('carbs')+' g'],['fat',m('fat')+' g']]){html.raw('<div class="nutrient-detail"><strong>');html.text(label+': ');html.raw('</strong>');html.text(number(displayValue(row.nutrients?.[key],key==='calories'?'kcal':'g',energyUnit)));const coverage=row.coverage?.[key];if(coverage&&!coverage.complete){html.raw(' <span class="coverage">');html.text(m('coverage',coverage));html.raw('</span>');}html.raw('</div>');};return;}
 if(row.kind==='exercise'){
  if(column.id!=='calories'){html.text(m('na'));return;}
  html.raw('<span data-print-diary-value>');html.text(number(displayValue(row.caloriesBurned===null?null:-row.caloriesBurned,'kcal',energyUnit)));html.text(' '+energyUnit);html.raw('</span>');element(html,'small',m('energyBurned'));return;
 }
 const capture=row.column;html.raw('<span data-print-diary-value>');html.text(capture.active?number(displayValue(capture.value,column.unit,energyUnit)):m('unknown'));if(capture.value!==null)html.text(' '+displayUnit(column.unit,energyUnit));html.raw('</span>');
 if(!capture.active)element(html,'small',m('netUnset'));else if(capture.status==='partial')element(html,'small',m('partial',capture.coverage));else if(capture.status==='unknown')element(html,'small',m('noAmount'));
}

export function renderPrintDocument(dto,{energyUnit='kcal',language='en'}={}){
  parseEnergyUnit(energyUnit);
  const m=(key,values)=>formatMessage(language,'printDocument.'+key,values),number=value=>printNumber(value,m);
  validate(dto,language);const bpFocused=(dto.sections.bloodPressure||dto.sections.glucoseKetones)&&!dto.sections.profile&&!dto.sections.nutrition&&!dto.sections.diary&&!dto.sections.notes&&!dto.sections.chartIds.length&&!(dto.sections.inlineCharts??[]).length;const html=new Html();html.raw('<!doctype html><html lang="');html.text(language);html.raw('"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; connect-src \'none\'; img-src \'none\'; frame-src \'none\'; font-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'; style-src \'self\'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>');html.text(m('title'));html.raw('</title><link rel="stylesheet" href="/report-source/print-');html.text(language);html.raw('.css"></head><body>');element(html,'h1',m('title'));html.raw('<div class="capture">');
  element(html,'p',m('generated',{at:dto.calendar.asOf,zone:dto.calendar.timeZone,today:dto.calendar.today}));element(html,'p',m('range',{from:dto.options.from,to:dto.options.to,filter:reportMessage(language,'filter.'+dto.options.dayFilter),today:m(dto.options.includeToday?'included':'excluded')}));element(html,'p',m('counts',{requested:dto.counts.requestedDays,today:dto.counts.excludedTodayDays,filtered:dto.counts.excludedByFilterDays,eligible:dto.counts.eligibleDays}));html.raw('</div>');
  html.raw(renderSourceAttributions(dto.attributions));
  if(bpFocused){html.raw('<div data-print-limitations>');for(const limitation of dto.limitations)element(html,'p',reportNoteText(limitation,language));html.raw('</div>');}
  if(!bpFocused)element(html,'p',m(dto.options.includeSupplements?'allFood':'excludeSupplements'));
  if(dto.supplementFilter){const value=dto.supplementFilter;element(html,'p',m('contributions',{food:value.includedFoodContributions,supplement:value.includedSupplementContributions,unclassified:value.includedUnclassifiedContributions,excluded:value.excludedSupplementContributions,empty:value.filteredEmptyDays}));}
  if(dto.sections.diary&&!dto.options.includeSupplements){html.raw('<p class="notice" data-print-supplement-scope>');html.text(m('diaryScope'));html.raw('</p>');}
  if(dto.sections.profile){
    const profile=dto.profile;element(html,'h2',m('profile'));element(html,'p',printProfileNote(profile.notice,language));
    html.raw('<table class="profile"><thead><tr>');for(const key of ['field','currentBasis'])cell(html,m(key),'th');html.raw('</tr></thead><tbody>');
    for(const [label,value]of [[m('currentDate'),profile.date],[m('name'),profile.name??m('unknown')]]){html.raw('<tr>');cell(html,label,'th');cell(html,value);html.raw('</tr>');}
    for(const key of Object.keys(printProfileLabels)){
      const row=profile[key];html.raw('<tr data-print-profile="'+key+'">');cell(html,m('profile.'+key),'th');html.raw('<td>');
      html.text(key==='sex'?(row.value===null?m('unknown'):m(row.value)):number(key==='resting'?displayValue(row.value,'kcal',energyUnit):row.value)+' '+(key==='resting'?m('perDay',{unit:energyUnit}):key==='age'?m('years'):row.unit));
      element(html,'small',printProfileNote(row.basis,language));html.raw('</td></tr>');
    }
    html.raw('</tbody></table>');
    if(Object.keys(profile.stored).length){element(html,'h3',m('stored'));element(html,'p',m('storedNotice'));html.raw('<p class="stored-profile">');for(const [index,[key,value]]of Object.entries(profile.stored).entries()){if(index)html.raw('; ');html.raw('<strong>');html.text(m('stored.'+key)+': ');html.raw('</strong>');html.text(value);}html.raw('</p>');}
  }
  if(dto.sections.nutrition){html.raw(renderScoreReport(dto.nutrition.scores,{presentation:'print',language}));html.raw(renderDataCompletenessReport(dto.nutrition.dataCompleteness,{presentation:'print',language}));
    appendBalancePrint(html,dto.nutrition.balances,{language});
    for(const fragment of energyReportFragments(dto.nutrition.energy,{presentation:'print',energyUnit,language}))html.raw(fragment);
    for(const capture of Object.values(dto.nutrition.carbohydrates).filter(c=>c.summary.visible)){
      element(html,'h2',m('average',{label:carbohydrateDisplayLabel(capture.definition,language)}));element(html,'p',language==='en'?capture.description:carbohydrateControlDescription(capture.definition,language));const row=capture.summary;
      element(html,'p',m('meanSummary',{mean:number(row.mean),known:row.knownDays,eligible:row.eligibleDays,partial:row.partialDays,unknown:row.unknownDays,zeros:row.zeroByCompletionDays}));
      element(html,'p',m('targetSummary',{target:number(row.meanTarget),days:row.targetKnownDays,percent:row.percentOfMeanTarget===null?m('unknown'):number(row.percentOfMeanTarget)+'%'}));
      if(row.maximum!==null||row.maximumRange!==null)element(html,'p',maximumReportText(row,{energyUnit,language}));
      element(html,'p',[...Object.entries(capture.reasons||{}).map(([id,count])=>carbohydrateReasonText(id,language)+' ('+count+')'),row.reason,row.targetReason].filter(Boolean).map(code=>reportReason(code,language)).join(' · '));
    }
    const visible=dto.nutrition.nutrients.filter(row=>row.visible);
    element(html,'h2',m('averageNutrition'));html.raw('<p class="method">');html.text(m('nutritionMethod'));html.raw('</p>');
    if(!visible.length){html.raw('<p class="empty" data-print-nutrients-empty>');html.text(m('hidden'));html.raw('</p>');}
    else{
      html.raw('<table class="nutrients"><thead><tr>');for(const keys of [['nutrientUnit'],['meanIntake'],['knownEligible','partialUnknown'],['zeros'],['meanTarget','targetKnown'],['percentReasons']]){html.raw('<th>');for(const [index,key] of keys.entries()){if(index)html.raw('<br>');html.text(m(key));}html.raw('</th>');}html.raw('</tr></thead><tbody>');
      for(const row of visible){
        html.raw('<tr><th lang="');html.text(language);html.raw('">');html.text(nutrientDisplayName(row,language));element(html,'small',displayUnit(row.unit,energyUnit)+' · '+nutrientGroupName(row.category,language));if(row.maximum!==null||row.maximumRange!==null)element(html,'small',maximumReportText(row,{energyUnit,language}));html.raw('</th>');cell(html,number(displayValue(row.mean,row.unit,energyUnit)));
        html.raw('<td>');html.text(`${row.knownDays} / ${row.eligibleDays}`);element(html,'small',m('partialUnknownCounts',{partial:row.partialDays,unknown:row.unknownDays}));html.raw('</td>');cell(html,row.zeroByCompletionDays);
        html.raw('<td>');html.text(number(displayValue(row.meanTarget,row.unit,energyUnit)));element(html,'small',m('targetKnownCount',{days:row.targetKnownDays}));html.raw('</td><td>');html.text(row.percentOfMeanTarget===null?m('unknown'):number(row.percentOfMeanTarget)+'%');element(html,'small',[row.reason,row.targetReason].filter(Boolean).map(code=>reportReason(code,language)).join(' · ')||'—');html.raw('</td></tr>');
      }
      html.raw('</tbody></table>');
    }
  }
  if(dto.sections.diary){const description=language==='en'?printDiaryColumnDescription(dto.diaryColumn):dto.diaryColumn.id==='netCarbohydrate'?carbohydrateControlDescription(dto.diaryColumn.definition,language):null;if(description)element(html,'p',description);element(html,'h2',m('diary'));html.raw('<table class="diary detail"><thead><tr>');for(const key of ['dateGroupTime','foodActivity','quantity'])cell(html,m(key),'th');html.raw('<th>');html.text(dto.diaryColumn.mode==='macros'?m('allValues'):nutrientDisplayName(dto.diaryColumn,language)+' ('+displayUnit(dto.diaryColumn.unit,energyUnit)+')');html.raw('</th></tr></thead><tbody>');for(const row of dto.diary){html.raw('<tr><td>');html.text(row.date);element(html,'small',row.group);element(html,'small',row.time||m('noTime'));html.raw('</td>');cell(html,row.name);html.raw('<td>');if(row.kind==='exercise'){sourceValue(html,row.duration,m);html.text(' min');}else if(row.quantity!==undefined){sourceValue(html,row.quantity,m);html.text(isQuantityUnit(row.unit)?' '+row.unit:row.unit==='batch'?' × '+m('fullRecipe'):' × '+(row.portionLabel||m('portion')));}else{sourceValue(html,row.amount,m);html.text(' '+m('servings'));}html.raw('</td><td>');diaryColumnCell(html,row,dto.diaryColumn,energyUnit,m);html.raw('</td></tr>');}html.raw('</tbody></table>');}
  if(dto.sections.bloodPressure){element(html,'h2',m('pressure'));html.raw(renderBloodPressureCapture(dto.bloodPressure,{presentation:'print',language}));}
  if(dto.sections.glucoseKetones){element(html,'h2',m('glucose'));html.raw(renderGlucoseKetoneCapture(dto.glucoseKetones,{presentation:'print',language}));}
  if(dto.sections.biometrics){element(html,'h2',m('biometrics'));html.raw('<table class="biometrics detail"><thead><tr>');for(const key of ['date','time','group','type','value','unit'])cell(html,m(key),'th');html.raw('</tr></thead><tbody>');for(const row of dto.biometrics){html.raw('<tr>');for(const value of [row.date,row.time||m('noTime'),row.group??m('noGroup'),row.type])cell(html,value);html.raw('<td>');sourceValue(html,row.value,m);html.raw('</td>');cell(html,row.unit);html.raw('</tr>');}html.raw('</tbody></table>');}
  if(dto.sections.notes){html.raw('<section class="notes">');element(html,'h2',m('notes'));for(const row of dto.notes){html.raw('<article class="note">');element(html,'h3',`${row.date} · ${row.time||m('noTime')}${row.group?' · '+row.group:''}`);html.raw('<p class="note-text">');html.text(row.text);html.raw('</p></article>');}html.raw('</section>');}
  if(dto.charts?.length){element(html,'h2',m('charts'));html.raw('<p class="method">');html.text(m('chartMethod'));html.raw('</p>');const series=new Map(dto.chartData.series.map(series=>[series.id,series]));for(const chart of dto.charts){const primary=series.get(chart.primarySeries),secondary=chart.secondarySeries===null?null:series.get(chart.secondarySeries);if(!primary||(chart.secondarySeries!==null&&!secondary))invalid();html.raw('<section class="chart-block">');element(html,'h3',chart.name);html.raw(renderChart({dates:dto.chartData.dates,primary,secondary,range:{from:dto.options.from,to:dto.options.to},...(chart.cycleOverlay===true?{cycleOverlay:dto.chartData.cycleOverlay}:{})},{presentation:'print',energyUnit,language}));html.raw('<p class="chart-legend">');html.text(`${metricDisplayName(primary,{language})} (${chartDisplayUnit(primary.metric,primary.info.unit,energyUnit)??m('unitRequired')})`);if(secondary)html.text(` · ${metricDisplayName(secondary,{language})} (${chartDisplayUnit(secondary.metric,secondary.info.unit,energyUnit)??m('unitRequired')}), ${m('separateScale')}`);html.raw('</p>');for(const selected of [primary,secondary])if(selected?.description)element(html,'p',chartSeriesDescription(selected,language));html.raw('</section>');}}
  if(!bpFocused&&dto.limitations.length){element(html,'h2',m('method'));html.raw('<ul class="limitations" data-print-limitations>');for(const limitation of dto.limitations)element(html,'li',reportNoteText(limitation,language));html.raw('</ul>');}html.raw('</body></html>');return html.finish();
}

export function reportStyles(language){return css(key=>formatMessage(language,"printDocument."+key))+BLOOD_PRESSURE_PRINT_CSS+GLUCOSE_KETONES_PRINT_CSS;}
