import {formatMessage} from './message-format.js';
import {PAIRING_CAPTURE_VERSION,isPairingGuidance} from './../server/pairing-guidance.mjs';
import {pairingNoteText} from './pairing-guidance.js';
import {cycleOverlayMarkup} from './cycle-overlay-renderer.js';
import {validateOptionalCycleOverlay} from './../server/cycle-overlay.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const object=value=>value&&typeof value==='object'&&!Array.isArray(value),date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const text=value=>typeof value==='string'&&value.length>0,finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const units=['mmol/L','mg/dL'],roles=['glucose','ketones'],colors={glucose:'#a34721',ketones:'#286c92',gki:'#536c2d'};
const exclusionReasons=['unsupported-unit','invalid-value','negative-value','out-of-range-value','invalid-time','invalid-date','invalid-id','duplicate-id'];
const number=(value,m)=>value===null?m('unavailable'):Object.is(value,-0)?'-0':String(value),time=(value,m)=>value||m('noTime');
const invalid=language=>{throw Error(formatMessage(language,'glucoseCapture.incomplete'));};
const readingKeys=['id','date','time','type','unit','value','sourceOrder','role','mmolL','displayValue'];
const sameReading=(a,b)=>readingKeys.every(key=>a[key]===b[key]);

/** Validate captured structure and referential consistency, never recalculate
 * concentrations, ratios, matching distance or the chosen pair assignment. */
export function validateGlucoseKetoneCapture(view,language='en'){
  if(!object(view)||view.version!==PAIRING_CAPTURE_VERSION||!object(view.range)||!date(view.range.from)||!date(view.range.to)||view.range.from>view.range.to||!object(view.calendar)||!text(view.calendar.asOf)||!text(view.calendar.timeZone)||!date(view.calendar.today)||!['unconfigured','empty','ready'].includes(view.status)||!Array.isArray(view.options)||!Array.isArray(view.readings)||!Array.isArray(view.pairs)||!Array.isArray(view.unmatched)||!Array.isArray(view.excluded)||!Array.isArray(view.rules)||view.rules.some(value=>!isPairingGuidance(value,'glucose.rule'))||!object(view.counts)||!object(view.conversion)||!object(view.series))invalid(language);
  validateOptionalCycleOverlay(view);
  if(!finite(view.conversion.glucoseMgDlPerMmolL)||view.conversion.glucoseMgDlPerMmolL===0||!finite(view.conversion.ketoneMgDlPerMmolL)||view.conversion.ketoneMgDlPerMmolL===0||typeof view.conversion.sourceUrl!=='string')invalid(language);
  try{if(new URL(view.conversion.sourceUrl).protocol!=='https:')invalid(language);}catch{invalid(language);}
  if(view.options.some(option=>!object(option)||!text(option.type)||!Array.isArray(option.units)||option.units.some(unit=>typeof unit!=='string')))invalid(language);
  if(view.mapping===null){if(view.status!=='unconfigured'||view.readings.length||view.pairs.length||view.unmatched.length||view.excluded.length)invalid(language);}
  else{const m=view.mapping;if(!object(m)||m.version!==1||!units.includes(m.displayUnit)||roles.some(role=>!object(m[role])||!text(m[role].type)||m[role].type!==m[role].type.trim())||m.glucose.type===m.ketones.type||view.status==='unconfigured')invalid(language);}
  const readings=new Map(),orders=new Set();
  for(const reading of view.readings){if(!object(reading)||!text(reading.id)||readings.has(reading.id)||!Number.isInteger(reading.sourceOrder)||reading.sourceOrder<0||orders.has(reading.sourceOrder)||!roles.includes(reading.role)||reading.type!==view.mapping?.[reading.role].type||!date(reading.date)||reading.date<view.range.from||reading.date>view.range.to||typeof reading.time!=='string'||reading.time!==''&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(reading.time)||!units.includes(reading.unit)||!finite(reading.value)||reading.value>1000000||!finite(reading.mmolL)||!finite(reading.displayValue))invalid(language);readings.set(reading.id,reading);orders.add(reading.sourceOrder);}
  const paired=new Set(),pairIds=new Set();let available=0;
  for(const pair of view.pairs){
    if(!object(pair)||!text(pair.id)||pairIds.has(pair.id)||!['time','order'].includes(pair.match)||(pair.match==='time'?(!Number.isInteger(pair.minutes)||pair.minutes<0||pair.minutes>10):pair.minutes!==null)||!date(pair.date)||typeof pair.time!=='string')invalid(language);
    for(const role of roles){const reading=pair[role],captured=readings.get(reading?.id);if(!captured||captured.role!==role||!sameReading(reading,captured)||paired.has(reading.id)||reading.date!==pair.date)invalid(language);paired.add(reading.id);}
    if(pair.time!==(pair.glucose.time||pair.ketones.time))invalid(language);
    if(pair.gki===null){if(!['zero-ketones','nonfinite-ratio'].includes(pair.reason))invalid(language);}else{if(!finite(pair.gki)||pair.reason!==null)invalid(language);available++;}pairIds.add(pair.id);
  }
  const unmatched=new Set();for(const item of view.unmatched){const captured=readings.get(item?.reading?.id);if(!captured||!roles.includes(item.role)||captured.role!==item.role||!sameReading(item.reading,captured)||paired.has(captured.id)||unmatched.has(captured.id)||item.reason!=='no-match')invalid(language);unmatched.add(captured.id);}
  if(paired.size+unmatched.size!==readings.size)invalid(language);
  const rawKeys=['id','date','time','type','unit','value','sourceOrder'];
  for(const item of view.excluded){if(!object(item)||!roles.includes(item.role)||!object(item.reading)||!exclusionReasons.includes(item.reason)||Object.keys(item.reading).some(key=>!rawKeys.includes(key))||rawKeys.some(key=>!Object.hasOwn(item.reading,key))||rawKeys.some(key=>item.reading[key]!==null&&!['string','number','boolean'].includes(typeof item.reading[key]))||!Number.isInteger(item.reading.sourceOrder)||item.reading.sourceOrder<0||orders.has(item.reading.sourceOrder)||item.reading.type!==view.mapping?.[item.role].type)invalid(language);orders.add(item.reading.sourceOrder);}
  const expected={selected:readings.size+view.excluded.length,eligible:readings.size,pairs:view.pairs.length,ratioAvailable:available,ratioUnavailable:view.pairs.length-available,unmatched:unmatched.size,excluded:view.excluded.length};
  for(const [key,value]of Object.entries(expected))if(view.counts[key]!==value)invalid(language);
  if(view.status==='empty'&&expected.selected!==0||view.status==='ready'&&expected.selected===0)invalid(language);
  for(const role of [...roles,'gki']){
    const series=view.series[role],source=role==='gki'?view.pairs:view.readings.filter(reading=>reading.role===role),expectedUnit=role==='gki'?null:view.mapping?.displayUnit||'mmol/L';
    if(!object(series)||series.unit!==expectedUnit||!Array.isArray(series.points)||series.points.length!==source.length)invalid(language);
    series.points.forEach((point,index)=>{const record=source[index],ratio=role==='gki';if(!object(point)||point[ratio?'pairId':'recordId']!==record.id||point.date!==record.date||point.time!==record.time||point.sourceOrder!==(ratio?record.glucose.sourceOrder:record.sourceOrder)||point.value!==(ratio?record.gki:record.displayValue))invalid(language);});
  }
  return view;
}

export const GLUCOSE_KETONES_PRINT_CSS=`.gki-capture table[data-cycle-overlay-table]{min-width:0}.gki-capture{min-width:0}.gki-capture p,.gki-capture li{overflow-wrap:anywhere}.gki-chart-block{margin:18px 0;break-inside:avoid;page-break-inside:avoid}.gki-chart{display:block;width:100%;height:auto;min-width:640px}.gki-chart-region,.gki-table-scroll{overflow-x:auto;max-width:100%}.gki-capture table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px;min-width:760px}.gki-capture th,.gki-capture td{border:1px solid #cbd5cc;padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}.gki-capture th{background:#eef3ec;color:#243a32}.gki-capture td small{display:block;margin-top:4px}.gki-capture tr{break-inside:avoid;page-break-inside:avoid}.gki-capture thead{display:table-header-group}.gki-legend{display:flex;flex-wrap:wrap;gap:8px 20px;font-size:12px}.gki-capture h3{margin:20px 0 10px}.gki-capture .gki-note,.gki-capture li{font-size:12px;line-height:1.6}.gki-capture ul{padding-left:20px}.gki-value{font-variant-numeric:tabular-nums}.gki-capture[data-presentation=print] .gki-chart{min-width:0}.gki-capture[data-presentation=print] .gki-chart-region,.gki-capture[data-presentation=print] .gki-table-scroll{overflow:visible}.gki-capture[data-presentation=print] table{min-width:0;font-size:7.5pt}.gki-capture[data-presentation=print] th,.gki-capture[data-presentation=print] td{padding:1.5mm}.gki-capture[data-presentation=print] .gki-note,.gki-capture[data-presentation=print] li{font-size:8pt}.gki-capture[data-presentation=print] a{color:inherit}.gki-capture[data-presentation=print] .gki-rules-block{break-inside:avoid;page-break-inside:avoid}`;

function chart(readings,series,lookups,concentrationMaximum,ratioMaximum,start,view,m,language){
  const width=760,height=300,left=86,right=88,x=index=>readings.length===1?width/2:left+index*(width-left-right)/(readings.length-1),y=(value,maximum)=>208-value/maximum*162;
  const overlay=cycleOverlayMarkup(view.cycleOverlay,{language,range:view.range,dates:readings.map(reading=>reading.date),axis:'reading-order',includeDetails:false,plot:{left,right:width-right,top:46,bottom:208,x}});
  const grid=[0,.25,.5,.75,1].map(f=>`<line x1="${left}" x2="${width-right}" y1="${208-f*162}" y2="${208-f*162}" stroke="#cad5ca" stroke-dasharray="3 4"/><text x="${left-8}" y="${212-f*162}" text-anchor="end">${escape(Number((concentrationMaximum*f).toPrecision(4)))}</text><text x="${width-right+8}" y="${212-f*162}">${escape(Number((ratioMaximum*f).toPrecision(4)))}</text>`).join('');
  let plots='';
  for(const role of [...roles,'gki']){
    const ratio=role==='gki',lookup=lookups[role],maximum=ratio?ratioMaximum:concentrationMaximum,unit=series[role].unit;
    let segment='',lines='',marks='';const flush=()=>{if(segment)lines+=`<path data-gki-line="${role}" d="${segment}" fill="none" stroke="${colors[role]}" stroke-width="2" ${ratio?'stroke-dasharray="5 3"':''}/>`;segment='';};
    readings.forEach((reading,index)=>{const point=lookup.get(ratio?reading.sourceOrder:reading.id);if(!point)return;
      if(point.value===null){flush();marks+=`<text data-gki-gap="gki" data-axis="right" x="${x(index)}" y="209" text-anchor="middle">×<title>${escape(m('gap',{date:point.date,time:time(point.time,m)}))}</title></text>`;return;}
      segment+=`${segment?'L':'M'}${x(index)},${y(point.value,maximum)} `;
      marks+=`<circle data-gki-series="${role}" data-axis="${ratio?'right':'left'}" data-value="${number(point.value,m)}" cx="${x(index)}" cy="${y(point.value,maximum)}" r="3.5" fill="white" stroke="${colors[role]}" stroke-width="2"><title>${escape(`${m(role)} ${point.date} ${time(point.time,m)}: ${number(point.value,m)} ${unit||m('unitless')}${ratio?m('anchored'):''}`)}</title></circle>`;
    });flush();plots+=lines+marks;
  }
  const ticks=readings.map((reading,index)=>`<text x="${x(index)}" y="231" text-anchor="middle"><tspan x="${x(index)}">#${start+index+1} ${reading.role==='glucose'?'G':'BHB'} ${escape(reading.date.slice(5))}</tspan><tspan x="${x(index)}" dy="16">${escape(time(reading.time,m))}</tspan></text>`).join('');
  return `<div class="gki-chart-block"><p class="gki-note">${escape(m('positions',{first:start+1,last:start+readings.length}))}</p><div class="gki-chart-region" role="region" tabindex="0" aria-label="${escape(m('plot'))}"><svg class="gki-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(m('plotDescription',{unit:series.glucose.unit}))}"><g fill="#344d40" font-family="Arial,sans-serif" font-size="12"><text x="${left}" y="20">${escape(m('concentration',{unit:series.glucose.unit}))}</text><text x="${width-right}" y="20" text-anchor="end">${escape(m('gkiAxis'))}</text>${overlay.bands}${grid}${plots}${ticks}</g></svg></div></div>`;
}
const tableStart=(label,headings)=>`<h3>${escape(label)}</h3><div class="gki-table-scroll" role="region" tabindex="0" aria-label="${escape(label)}"><table><thead><tr>${headings.map(heading=>`<th>${escape(heading)}</th>`).join('')}</tr></thead><tbody>`;
const tableEnd='</tbody></table></div>';
const sourceCell=(reading,m)=>`${escape(number(reading.value,m))} ${escape(reading.unit)}<small>${escape(time(reading.time,m))}</small><small>${escape(number(reading.mmolL,m))} mmol/L</small>`;
function fragments(language){const parts=[],encoder=new TextEncoder();let bytes=0;return {push(value){bytes+=encoder.encode(value).length;if(bytes>20000000)throw Error(formatMessage(language,'glucoseCapture.size'));parts.push(value);},join:()=>parts.join('')};}

export function renderGlucoseKetoneCapture(view,{presentation='screen',language='en'}={}){
  if(!['screen','print'].includes(presentation))invalid(language);validateGlucoseKetoneCapture(view,language);const m=(key,values)=>formatMessage(language,'glucoseCapture.'+key,values),out=fragments(language);
  out.push(`<section class="gki-capture" data-presentation="${presentation}" aria-label="${escape(m('capture'))}">${presentation==='screen'?`<style>${GLUCOSE_KETONES_PRINT_CSS}</style>`:''}<p>${escape(m('range',{...view.range,...view.counts}))}</p>`);
  if(view.mapping)out.push(`<p>${escape(m('selected',{glucose:view.mapping.glucose.type,ketones:view.mapping.ketones.type,unit:view.mapping.displayUnit}))}</p>`);
  if(view.status==='unconfigured')out.push(`<p>${escape(m('unconfigured'))}</p>`);
  if(view.status==='empty')out.push(`<p>${escape(m('empty'))}</p>`);
  out.push(cycleOverlayMarkup(view.cycleOverlay,{language,range:view.range,dates:[],axis:'reading-order',presentation}).details);
  const concentrationMaximum=roles.reduce((high,role)=>view.series[role].points.reduce((maximum,point)=>Math.max(maximum,point.value),high),1),ratioMaximum=view.series.gki.points.reduce((high,point)=>Math.max(high,point.value??0),1),chunk=presentation==='print'?6:8;
  const lookups=Object.fromEntries([...roles,'gki'].map(role=>[role,new Map(view.series[role].points.map(point=>[role==='gki'?point.sourceOrder:point.recordId,point]))]));
  if(view.readings.length){out.push(`<h3>${escape(m('title'))}</h3><div class="gki-legend">${[...roles,'gki'].map(role=>`<span data-print-color="${colors[role]}">${escape(m(role))} · ${escape(m(role==='gki'?'ratioLegend':'concentrationLegend',{unit:view.series[role].unit}))}</span>`).join('')}</div>`);for(let start=0;start<view.readings.length;start+=chunk)out.push(chart(view.readings.slice(start,start+chunk),view.series,lookups,concentrationMaximum,ratioMaximum,start,view,m,language));}
  if(view.readings.length){out.push(tableStart(m('eligible'),[m('dateTime'),m('roleMetric'),m('recorded'),m('normalized'),m('display')]));for(const reading of view.readings)out.push(`<tr data-gki-reading><td>${escape(reading.date)}<small>${escape(time(reading.time,m))}</small></td><td>${escape(m(reading.role))}<small>${escape(reading.type)}</small></td><td class="gki-value">${escape(number(reading.value,m))} ${escape(reading.unit)}</td><td>${escape(number(reading.mmolL,m))}</td><td>${escape(number(reading.displayValue,m))} ${escape(view.mapping.displayUnit)}</td></tr>`);out.push(tableEnd);}
  if(view.pairs.length){out.push(tableStart(m('evidence'),[m('pairDate'),m('glucoseSource'),m('ketoneSource'),m('gkiAxis'),m('method')]));view.pairs.forEach((pair,index)=>out.push(`<tr data-gki-pair><td>#${index+1}<small>${escape(pair.date)}</small></td><td>${sourceCell(pair.glucose,m)}</td><td>${sourceCell(pair.ketones,m)}</td><td class="gki-value">${pair.gki===null?escape(m('reason.'+pair.reason)):escape(number(pair.gki,m))}</td><td>${escape(m(pair.match==='time'?'time':'order',{minutes:pair.minutes}))}</td></tr>`));out.push(tableEnd);}
  if(view.unmatched.length){out.push(tableStart(m('unmatched'),[m('dateTime'),m('roleMetric'),m('sourceValue'),m('reason')]));for(const item of view.unmatched)out.push(`<tr data-gki-unmatched><td>${escape(item.reading.date)}<small>${escape(time(item.reading.time,m))}</small></td><td>${escape(m(item.role))}<small>${escape(item.reading.type)}</small></td><td>${sourceCell(item.reading,m)}</td><td>${escape(m('reason.'+item.reason))}</td></tr>`);out.push(tableEnd);}
  if(view.excluded.length){out.push(tableStart(m('excluded'),[m('rawDateTime'),m('roleMetric'),m('rawValueUnit'),m('reason')]));for(const item of view.excluded)out.push(`<tr data-gki-excluded><td>${escape(item.reading.date??m('unknownDate'))}<small>${escape(item.reading.time??m('unknownTime'))}</small></td><td>${escape(m(item.role))}<small>${escape(item.reading.type)}</small></td><td>${escape(item.reading.value===null?m('unknown'):String(item.reading.value))} ${escape(item.reading.unit??m('unknownUnit'))}</td><td>${escape(m('reason.'+item.reason))}</td></tr>`);out.push(tableEnd);}
  out.push(`<div class="gki-rules-block"><h3>${escape(m('rules'))}</h3><p class="gki-note">${escape(m('conversion',{glucose:number(view.conversion.glucoseMgDlPerMmolL,m),ketones:number(view.conversion.ketoneMgDlPerMmolL,m)}))} <a href="${escape(view.conversion.sourceUrl)}" target="_blank" rel="noreferrer">${escape(m('conversionSource'))}</a>. ${escape(m('classifications'))}</p><ul>${view.rules.map(rule=>`<li>${escape(pairingNoteText(rule,language))}</li>`).join('')}</ul></div></section>`);return out.join();
}
