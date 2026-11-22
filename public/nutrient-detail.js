import {request} from './diary-api.js';
import {escape as e} from './html.js';
import {displayValue,displayUnit} from './dashboard-source/energy-display.js';
import {t,uiLanguage} from './app-language.js';
import {coreText} from './core-cloud-messages.js';
import {nutrientDisplayName} from './report-source/public/nutrient-language.js';

const number=(value,language)=>Number.isFinite(value)?value.toLocaleString(language,{maximumFractionDigits:1}):'—';
/** A read-only sheet for either a day/selection or an explicitly filtered report. */
export function openNutrientDetail({nutrient,date,entryIds=null,options,show,header,content,onSource,onReport}){
 const report=options!==undefined,input=report?{nutrient,options}:{date,nutrient,entryIds},controller=new AbortController();
 show(`${header(coreText('nutrient.title'))}<section class="nutrient-detail" aria-busy="true"><p class="empty" role="status">${e(coreText('loading'))}</p></section>`);
 const root=content.querySelector('.nutrient-detail');
 const observer=new MutationObserver(()=>{if(!root.isConnected){controller.abort();observer.disconnect();}});observer.observe(content,{childList:true,subtree:true});
 async function load(){
  root.setAttribute('aria-busy','true');
  try{
   const value=await request(report?'/api/nutrition-report/nutrient':'/api/nutrient-detail',input,controller.signal);if(!root.isConnected)return;
   const language=value.language??uiLanguage(),text=(key,values)=>coreText('nutrient.'+key,values,language),message=key=>t('mobileNutrientDetail.'+key,{},language);
   const facts=report?value.detail.summary:value.contributions.target,unit=displayUnit(facts.unit,value.energyUnit),format=n=>`${number(displayValue(n,facts.unit,value.energyUnit),language)} ${unit}`;
   const amount=report?facts.mean:facts.value,target=report?facts.meanTarget:value.controls.dailyTarget.effective,entries=report?value.detail.entries:value.contributions.entries;
   const partial=report?facts.partialDays>0:facts.status==='partial',status=amount===null?text('noData'):partial?text('partial'):'';
   const range=report?`${value.report.options.from} – ${value.report.options.to}`:value.date;
   const scope=report?text('days',{known:facts.knownDays,total:facts.eligibleDays}):value.selection?text('selection',{count:value.selection.length}):'';
   const attributions=value.contributions?.attributions??value.report?.attributions??[];
   root.innerHTML=`<div class="nutrient-detail-heading"><h2>${e(nutrientDisplayName(facts,language))}</h2><p>${e(range)}${scope?` · ${e(scope)}`:''}</p></div><section class="nutrient-detail-summary"><span>${e(report?text('average'):value.selection?message('selection'):message('consumed'))}</span><strong>${e(format(amount))}</strong>${status?`<small>${e(status)}</small>`:''}<div><span>${e(message('target'))}</span><b>${e(format(target))}</b></div></section><h3>${e(report?text('top'):text('contributors'))}</h3><div class="nutrient-detail-sources">${entries.length?entries.map((row,index)=>{
    const tag=onSource&&row.id?'button':'div',amount=report?row.mean:row.value,percent=report?row.percentOfTarget:Number.isFinite(row.value)&&target>0?row.value/target*100:null,partial=row.coverage&&row.coverage.total>row.coverage.known;
    return `<${tag} ${tag==='button'?`type="button" data-source="${index}"`:''} class="nutrient-detail-source"><span><strong>${e(row.name)}</strong><small>${e(report?row.date:[row.time,row.group].filter(Boolean).join(' · '))}${partial?' · '+e(text('partial')):''}</small></span><span><b>${e(format(amount))}</b>${Number.isFinite(percent)?`<small>${e(text('percent',{amount:number(percent,language)}))}</small>`:amount===null?`<small>${e(text('noData'))}</small>`:''}</span></${tag}>`;
   }).join(''):`<p class="empty">${e(text('empty'))}</p>`}</div>${report&&(value.detail.unknownSources||value.detail.omittedSources)?`<p class="nutrient-detail-note">${[value.detail.unknownSources?text('unknownSources',{count:value.detail.unknownSources}):'',value.detail.omittedSources?text('moreSources',{count:value.detail.omittedSources}):''].filter(Boolean).map(e).join(' · ')}</p>`:''}${attributions.length?`<details class="nutrient-detail-credit"><summary>${e(message('foods'))}</summary>${attributions.map(text=>`<p>${e(text)}</p>`).join('')}</details>`:''}`;
   if(onReport){
    const link=document.createElement('button');
    link.type='button';link.className='more-results';link.textContent=t('mobileScoreDetail.report',{},language);
    link.onclick=()=>onReport(value.date);root.append(link);
   }
   root.querySelectorAll('[data-source]').forEach(button=>button.onclick=()=>{const row=entries[Number(button.dataset.source)];onSource({id:row.id,date:report?row.date:value.date});});
  }catch(error){if(root.isConnected&&error.name!=='AbortError'){root.innerHTML=`<p class="sheet-message" role="status">${e(error.message)}</p><button type="button" class="more-results" data-retry>${e(coreText('retry'))}</button>`;root.querySelector('[data-retry]').onclick=load;}}
  finally{if(root.isConnected)root.setAttribute('aria-busy','false');}
 }
 load();return {dispose(){controller.abort();observer.disconnect();root.replaceChildren();}};
}
