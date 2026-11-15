import {request} from './diary-api.js';
import {escape as e} from './html.js';
import {displayValue,displayUnit} from './dashboard-source/energy-display.js';

const number=value=>Number.isFinite(value)?value.toLocaleString(undefined,{maximumFractionDigits:1}):'—';
/** A read-only sheet for either a day/selection or an explicitly filtered report. */
export function openNutrientDetail({nutrient,date,entryIds=null,options,show,header,content,onSource}){
 const report=options!==undefined,input=report?{nutrient,options}:{date,nutrient,entryIds},controller=new AbortController();
 show(`${header('Nutrient details')}<section class="nutrient-detail" aria-busy="true"><p class="empty" role="status">Loading…</p></section>`);
 const root=content.querySelector('.nutrient-detail');
 const observer=new MutationObserver(()=>{if(!root.isConnected){controller.abort();observer.disconnect();}});observer.observe(content,{childList:true,subtree:true});
 async function load(){
  root.setAttribute('aria-busy','true');
  try{
   const value=await request(report?'/api/nutrition-report/nutrient':'/api/nutrient-detail',input,controller.signal);if(!root.isConnected)return;
   const facts=report?value.detail.summary:value.contributions.target,unit=displayUnit(facts.unit,value.energyUnit),format=n=>`${number(displayValue(n,facts.unit,value.energyUnit))} ${unit}`;
   const amount=report?facts.mean:facts.value,target=report?facts.meanTarget:value.controls.dailyTarget.effective,entries=report?value.detail.entries:value.contributions.entries;
   const partial=report?facts.partialDays>0:facts.status==='partial',status=amount===null?'No data':partial?'Partial data':'';
   const range=report?`${value.report.options.from} – ${value.report.options.to}`:value.date;
   const scope=report?`${facts.knownDays}/${facts.eligibleDays} days`:value.selection?`${value.selection.length} selected foods`:'';
   root.innerHTML=`<div class="nutrient-detail-heading"><h2>${e(facts.name)}</h2><p>${e(range)}${scope?` · ${e(scope)}`:''}</p></div><section class="nutrient-detail-summary"><span>${report?'Daily average':value.selection?'Selected foods':'Consumed'}</span><strong>${e(format(amount))}</strong>${status?`<small>${e(status)}</small>`:''}<div><span>Daily target</span><b>${e(format(target))}</b></div></section><h3>${report?'Top sources · daily average':'Contributing foods'}</h3><div class="nutrient-detail-sources">${entries.length?entries.map((row,index)=>{
    const tag=onSource&&row.id?'button':'div',amount=report?row.mean:row.value,percent=report?row.percentOfTarget:Number.isFinite(row.value)&&target>0?row.value/target*100:null,partial=row.coverage&&row.coverage.total>row.coverage.known;
    return `<${tag} ${tag==='button'?`type="button" data-source="${index}"`:''} class="nutrient-detail-source"><span><strong>${e(row.name)}</strong><small>${e(report?row.date:[row.time,row.group].filter(Boolean).join(' · '))}${partial?' · Partial':''}</small></span><span><b>${e(format(amount))}</b>${Number.isFinite(percent)?`<small>${number(percent)}% of target</small>`:amount===null?'<small>No data</small>':''}</span></${tag}>`;
   }).join(''):'<p class="empty">No contributing foods</p>'}</div>${report&&(value.detail.unknownSources||value.detail.omittedSources)?`<p class="nutrient-detail-note">${[value.detail.unknownSources?`${value.detail.unknownSources} ${value.detail.unknownSources===1?'source':'sources'} with no data`:'',value.detail.omittedSources?`${value.detail.omittedSources} more sources`:''].filter(Boolean).join(' · ')}</p>`:''}${(value.contributions?.attributions??value.report.attributions??[]).length?`<details class="nutrient-detail-credit"><summary>Sources</summary>${(value.contributions?.attributions??value.report.attributions).map(text=>`<p>${e(text)}</p>`).join('')}</details>`:''}`;
   root.querySelectorAll('[data-source]').forEach(button=>button.onclick=()=>{const row=entries[Number(button.dataset.source)];onSource({id:row.id,date:report?row.date:value.date});});
  }catch(error){if(root.isConnected&&error.name!=='AbortError'){root.innerHTML=`<p class="sheet-message" role="status">${e(error.message)}</p><button type="button" class="more-results" data-retry>Try again</button>`;root.querySelector('[data-retry]').onclick=load;}}
  finally{if(root.isConnected)root.setAttribute('aria-busy','false');}
 }
 load();return {dispose(){controller.abort();observer.disconnect();root.replaceChildren();}};
}
