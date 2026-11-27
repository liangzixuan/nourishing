import {appendShellNavigation} from './app-shell.js';
import {renderDashboardSettings} from './dashboard-settings.js';
import {carbohydrateDisplayLabel} from './report-source/public/carbohydrate-description.js';
import {nutrientDisplayName} from './report-source/public/nutrient-language.js';
import {scoreDisplayName} from './report-source/public/score-language.js';
import {presentFastingTiming} from './diary-snapshot.js';
import {dc} from './discover-cloud-messages.js';
import {uiLanguage,t} from './app-language.js';
import {mountCgmDetail} from './cgm-detail.js';
import {openStreakShare} from './streak-sharing.js';
import {chartCardMarkup,mountChartPlots} from './chart-presentation.js';
import {mountChartDetail} from './chart-detail.js';
import {dashboardHealthCardsMarkup,openDashboardHealthCard} from './dashboard-health-cards.js';
import {request,command,queueCommand} from './diary-api.js';
import {readDeviceCache,writeDeviceCache} from './device-cache.js';
import {onBackgroundWriteStatus} from './background-writes.js';
import {navigationEdge} from './edge-navigation.js';
import {escape as e,card,button as b,iconButton as ib,symbol as icon,ranges,widgets,chartMarkup} from './dashboard-source/discover-ui.js';
import {streakSettingsMarkup,newsfeedMarkup} from './dashboard-source/discover-settings-ui.js';
import {parseNewsfeed,newsCardsMarkup} from './dashboard-source/discover-news.js';
import {discoverSleepSummary,discoverSleepDetails} from './dashboard-source/discover-sleep.js';
import {validateSleepView} from './dashboard-source/sleep.js';
import {formatMessage} from './dashboard-source/message-format.js';
import {displayValue,displayUnit} from './dashboard-source/energy-display.js';
import {drawDashboardCharts} from './dashboard-source/dashboard-charts.js';
const known=Number.isFinite,number=value=>known(value)?value.toLocaleString(uiLanguage(),{maximumFractionDigits:1}):'—';
const option=(value,label,current)=>`<option value="${e(value)}" ${value===current?'selected':''}>${e(label)}</option>`;

const message=(key,values)=>formatMessage(uiLanguage(),'discover.'+key,values);
const summaryWidgetLabel=widget=>widget==='Remaining'?t('mobileDiary.remaining'):message('widget.'+widget);
function sleepCard(sleep,language,showPrompt){
 const empty=sleep.status==='empty';
 const badge=empty
  ? '<svg viewBox="0 0 72 72" aria-hidden="true"><path fill="#00bfc6" d="M38 16a20.5 20.5 0 1 0 18 26A16 16 0 0 1 38 16Z"/><path fill="none" stroke="#007572" stroke-width="4.5" stroke-linecap="round" d="M45 21c1-4 10-4 10 1 0 4-5 3-5 6"/><circle fill="#007572" cx="50" cy="32.5" r="2.3"/></svg>'
  : icon('bedtime');
 const prompt=showPrompt?`<div class="dc-connect-banner"><div class="dc-badge">${icon('smartwatch')}</div>${b(t('discover.sleep.connect'),'connect')}${ib('close',message('sleep.dismissConnect'),'dismiss-sleep')}</div>`:'';
 return card(t('measurementCatalog.metric.sleep'),
  `<p>${t('discover.sleep.breakdown')}</p><div class="dc-inset"><h2>${t('activity.mobileDuration')}</h2><div class="dc-badge">${badge}</div>${discoverSleepSummary(sleep,language)}</div>${prompt}`,
  null,empty?'dc-sleep dc-sleep-empty':'dc-sleep');
}
function nextWidget(current){
 return current==='Consumed'?'Remaining':'Consumed';
}
function summaryMarkup({summary,unit}){
 const {widget,range}=summary,language=uiLanguage(),consumed=widget==='Consumed',compact=consumed||widget==='Remaining';
 const fixed=value=>value.toLocaleString(language,{minimumFractionDigits:1,maximumFractionDigits:1});
 const rowName=row=>{
  if(summary.scores)return scoreDisplayName(row,language);
  if(compact&&['protein','fat'].includes(row.id))return message('energy.'+row.id);
  if(row.id!=='trackedCarbohydrate')return nutrientDisplayName(row,language);
  if(compact&&row.definition?.mode==='total')return message('energy.carbs');
  return row.definition===undefined?t('metric.trackedCarbohydrate'):carbohydrateDisplayLabel(row.definition,language);
 };
 const rows=summary.rows.map(row=>{
  const name=rowName(row),value=displayValue(row.mean,row.unit,unit);
  if(compact){
   const amount=known(value)?fixed(value)+' '+displayUnit(row.unit,unit):dc('summaryWhenLogged');
   const completionZero=consumed&&value===0&&row.knownDays>0&&row.knownDays===row.zeroByCompletionDays;
   return `<div data-summary-nutrient="${e(row.id)}"><strong>${e(name)}</strong><span>${completionZero?e(dc('summaryWhenLogged'))+' - ':''}${e(amount)}</span></div>`;
  }
  const percent=summary.scores?row.mean:row.percentOfMeanTarget;
  return `<div data-summary-nutrient="${e(row.id)}"><span>${e(name)}</span><strong>${number(value)}${known(row.mean)?' '+e(displayUnit(row.unit??'%',unit)):''}</strong></div>${summary.targets&&known(percent)?`<progress max="100" value="${Math.max(0,Math.min(100,percent))}" aria-label="${e(message('summary.progress',{name}))}"></progress>`:''}`;
 }).join('');
 const title=['Consumed','Remaining','Expenditure'].includes(widget)?message('summary.average',{widget:summaryWidgetLabel(widget)}):summaryWidgetLabel(widget);
 const switchLabel=dc('switchSummary',{widget:summaryWidgetLabel(nextWidget(widget))});
 const arrows='<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 5 9 9l5 4v-3h8V8h-8zM10 11l5 4-5 4v-3H2v-2h8z"/></svg>';
 const mode=b(arrows,'switch-report','dc-icon',`aria-label="${e(switchLabel)}"`);
 const hasEnergy=Object.hasOwn(summary,'energy');
 const energy=hasEnergy?`<strong class="dc-summary-number">${known(summary.energy)?fixed(displayValue(summary.energy,'kcal',unit))+' '+e(unit):e(message('summary.noData'))}</strong>`:'';
 const period=range.from===range.to?range.from:range.from+' - '+range.to;
 const dates=b(e(period)+icon('arrow_drop_down'),'report-period','dc-summary-period',`aria-label="${e(t('discover.title.date-range')+': '+period)}"`);
 const list=compact?`<div class="dc-summary-macros">${rows}</div>`:hasEnergy&&!known(summary.energy)?`<div class="dc-inset">${e(message('summary.noAverage'))}</div>`:`<div class="dc-macro-list">${rows||e(message(summary.scores?'summary.noScores':'summary.noHighlights'))}</div>`;
 const body=`<div class="dc-summary-header"><div class="dc-summary-caption">${e(title)}</div>${mode}</div><div class="dc-summary-period-row">${energy}${dates}</div>${list}${b(message('summary.full'),'report','dc-link')}`;
 return `<div class="dc-section-heading"><h2>${e(message('summary.title'))}</h2>${b(message('summary.edit'),'edit-report','dc-link')}</div>${card('',body,null,'dc-summary')}`;
}

function applyLocalDashboardPatch(target,type,payload){
 if(!target)return;
 if(type==='dashboard.widgets'){
  Object.assign(target.dashboard.widgets,payload.patch);
  if(target.capture?.settings?.widgets)Object.assign(target.capture.settings.widgets,payload.patch);
 }else if(type==='dashboard.preferences'){
  Object.assign(target.preferences,payload.patch);
  const nextWidgetId=payload.patch?.reportWidget;
  if(nextWidgetId&&target.summaries?.[nextWidgetId]){
   target.summary=structuredClone(target.summaries[nextWidgetId]);
  }
 }else if(type==='dashboard.streakReset'){
  if(target.streaks)target.streaks={...target.streaks,current:payload.count};
  if(target.capture?.cards?.streaks)target.capture.cards.streaks={...target.capture.cards.streaks,current:payload.count};
 }
}

/** Original Discover card/settings/sleep renderers, with cloud transport and modal ownership. */
export async function openDashboardNews({show,close,content,date,news}){
 show(`<header class="sheet-header dc-discover-child-header"><button type="button" class="icon-button" data-news-back aria-label="${e(t('discover.back'))}"><img src="/snapshot-source/chevron-left.svg" alt=""></button><h2 id="sheet-title">${e(t('discover.title.newsfeed'))}</h2></header><section class="dashboard-panel dc-news-page" aria-busy="true"></section>`);
 const panel=content.querySelector('.dc-news-page');
 content.querySelector('[data-news-back]').onclick=close;
 appendShellNavigation(content,original=>{close();original.click();});
 try{
  const feed=news??(await request('/api/dashboard?'+new URLSearchParams({date:date()}))).news;
  const items=parseNewsfeed(feed);
  if(panel.isConnected)panel.innerHTML=items.length?newsCardsMarkup(items):newsfeedMarkup(uiLanguage());
 }catch(error){
  if(panel.isConnected){panel.setAttribute('role','alert');panel.textContent=error.message;}
 }finally{panel.removeAttribute('aria-busy');}
}

export function mountDashboard({root,date,show,close,header,content,onChange,onReport,onFasting,onWeight,onConnect,onCoach,onDiary,onHealth,onReady}){
 let data,disposed=false,generation=0,charts=[],pinnedPlots,cgmDetail,chartDetail,controller,clockTimer,refreshTimer,clockStart=0;
 let editSerial=0,writeQueue=Promise.resolve(),pendingRefresh=false,ptrRefreshing=false,ptrGesture=null;
 const ownerTicket=readDeviceCache('/api/diary').then(cached=>cached.ticket).catch(()=>null);
 const dashboardPath=()=>'/api/dashboard?'+new URLSearchParams({date:date()});
 const modalOpen=()=>Boolean(content.querySelector('.dashboard-panel')||document.querySelector('dialog[open],[aria-modal="true"]'));
 const detailObserver=new MutationObserver(()=>{
  if(chartDetail&&!chartDetail.element.isConnected){chartDetail.dispose();chartDetail=null;}
  if(cgmDetail&&!cgmDetail.element.isConnected){cgmDetail.dispose();cgmDetail=null;}
  if(pendingRefresh&&!modalOpen()){pendingRefresh=false;void load({fresh:true,silent:true});}
 });detailObserver.observe(content,{childList:true});
 const language=uiLanguage(),message=(key,values)=>formatMessage(language,'discover.'+key,values),alive=()=>!disposed&&root.isConnected;
 function destroyCharts(){pinnedPlots?.dispose();pinnedPlots=null;for(const chart of charts)chart.destroy();charts=[];}
 function failure(error,host=root){if(!alive())return;let status=host.querySelector('[data-dashboard-status]');if(!status){status=document.createElement('p');status.dataset.dashboardStatus='';status.className='sheet-message';status.setAttribute('role','alert');host.prepend(status);}status.textContent=error.message;}
 const dateLabel=d=>new Date(d+'T12:00:00Z').toLocaleDateString(language,{month:'short',day:'numeric',timeZone:'UTC'});
 function chartContext(){return {language,message,preferences:data.preferences,unit:data.unit,energyDays:data.energyDays,weightFacts:()=>data.weight,weightLegend:()=>weightLegend(),dateLabel,get disposed(){return !alive();},get charts(){return charts;},fail:error=>failure(error)};}
 function weightLegend(){return [message('weight.series',{unit:data.weight.unit}),...(known(data.weight.target)?[message('weight.target',{value:number(data.weight.target)+' '+data.weight.unit})]:[])];}
 function energyLegend(){return data.preferences.energyShow==='Consumed'?[t('printDocument.protein'),t('discover.energy.carbs'),t('printDocument.fat'),t('discover.energy.alcohol')]:[message('energy.'+data.preferences.energyShow)];}
 const capturedNow=()=>Date.parse(data.capture.calendar.asOf)+performance.now()-clockStart;
 function shortDuration(ms){
  const minutes=Math.max(0,Math.floor(ms/60000));
  const units=[['day',Math.floor(minutes/1440)],['hour',Math.floor(minutes/60)%24],['minute',minutes%60]];
  return units.filter(([,value],index)=>value||index===2).map(([unit,value])=>new Intl.NumberFormat(language,{style:'unit',unit,unitDisplay:'short'}).format(value)).join(' ');
 }
 function fastingTiming(){return presentFastingTiming(data.capture.cards.fasting,performance.now()-clockStart);}
 function fastText(fast){
  if(!fast||fast.status==='none')return Number.isFinite(fast?.lastFastEnd)?dc('sinceFast',{duration:shortDuration(capturedNow()-fast.lastFastEnd)}):dc('noActiveFast');
  if(fast.status==='future-start')return message('fasting.starts',{time:new Date(fast.active.start).toLocaleString(language,{timeZone:data.capture.calendar.timeZone})});
  const down=data.preferences.timerDirection==='down'&&fast.remainingSeconds!==null;
  const seconds=Math.floor(down?fast.remainingSeconds:fast.elapsedSeconds);
  const clock=`${Math.floor(seconds/3600)}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  return [fast.active.label,dc(down?'remainingFast':'elapsedFast',{clock})].filter(Boolean).join(' - ');
 }
 function nextFastText(){return data.upcoming.label+' '+message('fasting.startingIn')+' '+shortDuration(Date.parse(data.upcoming.start)-capturedNow());}
 function fastingCard(){
  const fast=fastingTiming(),active=fast.status!=='none';
  const timestamp=value=>new Date(value).toLocaleString(language,{timeZone:data.capture.calendar.timeZone,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const end=fast.active?.goalHours==null?null:Date.parse(fast.active.start)+fast.active.goalHours*3600000;
  const field=(label,value,action)=>{
   const text=`<span>${e(label)}</span><strong>${e(value)}</strong>`;
   return action?b(text,action,'dc-fast-time','aria-label="'+e(label+' '+value)+'"'):'<div class="dc-fast-time">'+text+'</div>';
  };
  const timing=active?`<div class="dc-fast-times">${field(message('fasting.startTime'),timestamp(fast.active.start),'edit-fast-start')}${field(message('fasting.endTime'),end===null?message('fasting.openEnded'):timestamp(end),end===null?null:'edit-fast-goal')}</div>`
   :data.upcoming?`<p><span data-next-fast>${e(nextFastText())}</span> ${b(t('discover.fasting.startNow'),'start-now','dc-link')}</p>`:`<p>${e(message('fasting.noUpcoming'))}</p>`;
  const progress=fast.progressPercent==null?'':`<progress data-fast-progress aria-label="${e(t('capabilities.fasting.name'))}" max="100" value="${Math.min(100,fast.progressPercent)}"></progress>`;
  const body=`<p class="dc-fast-clock-row"><span data-fast-clock>${e(fastText(fast))}</span> ${active?b(message('summary.edit'),'edit-active-fast','dc-link'):''}</p>${progress}${timing}${b(active?dc('stopFast'):message('fasting.new'),active?'end-fast':'new-fast','dc-pill')}`;
  return card(t('capabilities.fasting.name'),body,'fasting','dc-fast');
 }
 async function load({fresh=false,silent=false}={}){
  const id=++generation,startedSerial=editSerial;
  controller?.abort();controller=new AbortController();
  try{
   const apply=next=>{
    if(!alive()||id!==generation||startedSerial!==editSerial)return;
    if(next.capture.cards.sleep)validateSleepView(next.capture.cards.sleep,next.capture.range,language);
    parseNewsfeed(next.news);
    data=next;
    clockStart=performance.now()-Math.max(0,Date.now()-(Date.parse(next.capture.calendar.asOf)||Date.now()));
    render();
    onReady?.();
   };
   const next=await request(dashboardPath(),undefined,controller.signal,{fresh,onRefresh:refreshed=>{if(!modalOpen())apply(refreshed);}});
   apply(next);
  }catch(error){
   if(alive()&&!controller.signal.aborted&&id===generation&&!silent){failure(error);onReady?.(false);}
  }
 }
 function updatePtr(height,state,dragging=false){
  const ptr=root.querySelector('.dc-ptr');if(!ptr)return;
  if(height<=0&&state==='idle'){ptr.hidden=true;ptr.style.height='0px';ptr.style.opacity='0';ptr.dataset.state='idle';ptr.dataset.dragging='false';return;}
  ptr.hidden=false;
  ptr.dataset.dragging=String(dragging);
  ptr.dataset.state=state;
  ptr.style.height=`${Math.round(height)}px`;
  ptr.style.opacity=String(Math.min(1,height/44));
  const label=ptr.querySelector('.dc-ptr-label'),glyph=ptr.querySelector('.dc-ptr-icon');
  if(label)label.textContent=state==='refreshing'?dc('refreshing'):state==='ready'?dc('releaseToRefresh'):dc('pullToRefresh');
  if(glyph&&state!=='refreshing')glyph.style.transform=`rotate(${Math.min(180,Math.round(height*3))}deg)`;
 }
 function render(){
  destroyCharts();
  const w=data.dashboard.widgets,p=data.preferences,c=data.capture.cards,weight=data.weight,change=weight.records.length?weight.records.at(-1).value-weight.records[0].value:null;
  const streak=c.streaks??data.streaks;
  const visibleHealth={...(w.glucose&&data.health?.glucose?{glucose:data.health.glucose}:{}),...(w.cycle&&data.health?.cycle?{cycle:data.health.cycle}:{})};
  root.innerHTML=`<section class="cloud-dashboard"><div class="dc-ptr" aria-live="polite" hidden><span class="dc-ptr-icon" aria-hidden="true">↻</span><span class="dc-ptr-label"></span></div><div class="dc-dashboard"><p data-dashboard-status class="dc-status" role="alert"></p>${p.newsVisible?newsCardsMarkup(parseNewsfeed(data.news)):''}${w.nutrition?summaryMarkup(data):''}${w.coach&&onCoach?card('Nourishing Coach',`<div class="dc-inset">${e(dc('coachAbout'))}</div>${b(t('discover.getStarted'),'coach','dc-pill')}`,null,'dc-coach'):''}${w.streaks&&streak?card(message('streak.title'),`<div class="dc-streak-frame"><div class="dc-streak">${ib('share',t('discover.shareStreak'),'share-streak')}<div class="dc-badge">${icon('calendar_month')}</div><strong>${streak.current}</strong><p>${t('discover.streak.dayStreak')}</p><p>${streak.current?message('streak.keep'):message('streak.begin')}</p></div></div>`,'streak-stats'):''}${w.energy?card(message('title.energy',{unit:data.unit}),chartMarkup('energy',energyLegend()),'energy'):''}${p.weightGoalVisible?card(t('discover.weight.goal'),`<div class="dc-inset"><div class="dc-badge">${icon('weight')}</div><strong>${e(message('weight.'+data.goal.mode))}</strong><p>${number(data.goal.value)} ${e(data.goal.unit)}</p></div>${onWeight?b(message('weight.log'),'weight-log','dc-pill'):''}`,null,'dc-weight-goal'):''}${w.weight?card(message('weight.change',{value:number(change),unit:weight.unit}),chartMarkup('weight',weightLegend()),'weight'):''}${w.fasting&&p.fastingEnabled&&c.fasting?fastingCard():''}${w.sleep&&c.sleep?sleepCard(c.sleep,language,p.sleepPrompt&&onConnect):''}${w.sleep&&p.sleepPromotion&&onConnect?card('',`<div class="dc-badge">${icon('bedtime')}</div><div><h2>${t('discover.sleep.eatSmarter')}<br>${t('discover.sleep.sleepBetter')}</h2><p>${t('discover.sleep.promotion')}</p>${b(t('discover.getStarted'),'connect','dc-link')}</div>${ib('close',t('discover.sleep.dismissPromotion'),'dismiss-sleep-promo')}`,null,'dc-connect-promo'):''}${dashboardHealthCardsMarkup(visibleHealth)}${data.pinnedCharts.cards.map(card=>chartCardMarkup(card,{pinned:true})).join('')}</div></section>`;
  root.querySelector('.cloud-dashboard').onclick=event=>{const chartId=event.target.closest('[data-chart-open]')?.dataset.chartOpen;if(chartId){const ui={show,header,content,close,onChange,afterSave:()=>load({fresh:true,silent:true}),onEditor:editor=>{chartDetail=editor;}};if(chartId==='cgm'){cgmDetail?.dispose();cgmDetail=mountCgmDetail(data.pinnedCharts,ui);return;}chartDetail?.dispose();chartDetail=mountChartDetail(data.pinnedCharts,chartId,ui);return;}const action=event.target.closest('[data-discover]')?.dataset.discover;if(action)void actionHandler(action).catch(error=>failure(error));};
  pinnedPlots=mountChartPlots(root,data.pinnedCharts);void drawDashboardCharts.call(chartContext(),root);clearInterval(clockTimer);clockTimer=setInterval(()=>{if(!data?.capture?.cards?.fasting)return;const label=root.querySelector('[data-fast-clock]');if(label){const timing=fastingTiming();label.textContent=fastText(timing);const progress=root.querySelector('[data-fast-progress]');if(progress)progress.value=Math.min(100,timing.progressPercent);}const next=root.querySelector('[data-next-fast]');if(next&&data.upcoming)next.textContent=nextFastText();},1000);
 }
 function modal(title,html){show(`${header(title)}<div class="dashboard-panel">${html}<p data-dashboard-status class="sheet-message" role="alert"></p></div>`);return content.querySelector('.dashboard-panel');}
 function widgetNeedsFetch(type,payload){
  if(type==='dashboard.widgets'){
   const patch=payload.patch??{};
   if(patch.sleep&&!data?.capture?.cards?.sleep)return true;
   if(patch.fasting&&!data?.capture?.cards?.fasting)return true;
   if(patch.glucose&&!data?.health?.glucose)return true;
   if(patch.cycle&&!data?.health?.cycle)return true;
   if(patch.energy&&!data?.energyDays?.length)return true;
   return false;
  }
  if(type==='dashboard.preferences'){
   const patch=payload.patch??{};
   if('reportRange' in patch||'energyRange' in patch||'weightRange' in patch||'customFrom' in patch||'customTo' in patch||'weightTarget' in patch||'weightZoom' in patch||'energyShow' in patch)return true;
   if(patch.reportWidget&&!data?.summaries?.[patch.reportWidget])return true;
  }
  return false;
 }
 async function save(type,payload,host,{needsRefresh=widgetNeedsFetch(type,payload)}={}){
  if(!data)return false;
  const previous=structuredClone(data);
  const serial=++editSerial;
  const path=dashboardPath();
  applyLocalDashboardPatch(data,type,payload);
  render();
  const ticket=await ownerTicket;
  if(ticket){
   const snapshot=structuredClone(data);
   try{
    await queueCommand(data.revision,type,payload,{ticket,projection:{responses:{[path]:snapshot}}});
    void writeDeviceCache(path,snapshot,ticket).catch(()=>false);
    Promise.resolve().then(()=>onChange?.()).catch(()=>{});
    if(needsRefresh){
     if(modalOpen())pendingRefresh=true;
     else void load({fresh:true,silent:true});
    }
    return true;
   }catch(error){
    if(serial===editSerial){data=previous;render();}
    failure(error,host);
    return false;
   }
  }
  // Standalone/online-only fallback (no device cache ticket): serialize writes without disabling controls.
  const work=writeQueue.then(async()=>{
   try{
    const result=await command(data.revision,type,payload);
    if(result?.revision&&data)data.revision=result.revision;
    Promise.resolve().then(()=>onChange?.()).catch(()=>{});
    if(needsRefresh&&serial===editSerial){
     if(modalOpen())pendingRefresh=true;
     else await load({fresh:true,silent:true});
    }
    return true;
   }catch(error){
    if(serial===editSerial){data=previous;render();}
    failure(error,host);
    return false;
   }
  });
  writeQueue=work.catch(()=>{});
  return work;
 }
 function settings(){
  const host=modal(t('discover.title.dashboard-settings'),'');
  renderDashboardSettings({
   host,
   data,
   coachAvailable:!!onCoach,
   onStreak:streakSettings,
   onSave:async(type,payload)=>{
    const ok=await save(type,payload,host);
    if(!ok)throw Error(host.querySelector('[data-dashboard-status]')?.textContent??'');
   },
  });
 }
 function streakStats(){
  const stats=data.streaks,rows=['food','exercise','metric','fast'];
  show(`<header class="sheet-header dc-discover-child-header"><button type="button" class="icon-button" data-stats-back aria-label="${e(t('discover.back'))}"><img src="/more-source/icons/chevron-left.svg" alt=""></button><h2 id="sheet-title">${e(message('title.streaks'))}</h2>${ib('share',t('discover.shareStreak'),'share-streak')}</header><section class="dashboard-panel"><div class="dc-stats"><div class="dc-stats-summary"><div>${e(message('streak.longest'))}</div><strong>${number(stats.longest)}</strong><div>${e(message('streak.dayUnit'))}</div></div><details><summary aria-label="${e(t('mobileScoreSettings.help'))}"><span>?</span></summary><p>${e(dc('streakHelp'))}</p></details><section><h2>${e(message('title.streaks'))}</h2><dl>${rows.map(key=>`<div><dt><span class="dc-stat-icon dc-stat-${key}" aria-hidden="true"></span>${e(message('streak.'+key))}</dt><dd>${number(stats.savedCounts[key])}</dd></div>`).join('')}</dl></section></div></section>`);
  appendShellNavigation(content,original=>{close();original.click();});
  content.querySelector('[data-stats-back]').onclick=close;
  content.querySelector('[data-discover=share-streak]').onclick=()=>openStreakShare(stats,{show,header,content,language});
 }
 function streakSettings(){
  const host=modal(t('discover.title.streak-settings'),streakSettingsMarkup(data.streaks,data.dashboard.widgets.streaks,language));
  host.querySelector('[data-widget]').onchange=event=>{void save('dashboard.widgets',{patch:{streaks:event.target.checked}},host);};
  host.querySelector('[data-discover=reset-streak]').onclick=async()=>{const form=host.querySelector('form');if(form.reportValidity()&&await save('dashboard.streakReset',{count:Number(form.elements.count.value)},host))streakSettings();};
  host.querySelector('form').onsubmit=event=>event.preventDefault();
 }
 function rangeSettings(kind){const p=data.preferences,key=['edit-report','report-period'].includes(kind)?'reportRange':kind+'Range',title=kind==='report-period'?t('discover.title.date-range'):kind==='edit-report'?message('summary.title'):kind==='energy'?t('activity.energy'):t('measurementCatalog.metric.weight'),from=p.customFrom??data.summary.range.from,to=p.customTo??date(),editWidgets=['Consumed','Remaining',...widgets.filter(w=>w!=='Consumed')];
  const host=modal(title,`<form class="entry-form"><label class="field-row"><span>${t('discover.title.date-range')}</span><select name="range" aria-label="${t('discover.title.date-range')}">${ranges.map(([value,label])=>option(value,message('range.'+value),p[key])).join('')}</select></label><div data-custom-range ${p[key]==='custom'?'':'hidden'}><label class="field-row"><span>${t('recordCleanup.from')}</span><input type="date" name="from" aria-label="${t('recordCleanup.from')}" value="${e(from)}" required></label><label class="field-row"><span>${t('recordCleanup.to')}</span><input type="date" name="to" aria-label="${t('recordCleanup.to')}" value="${e(to)}" required></label></div>${kind==='edit-report'?`<label class="field-row"><span>${message('summary.widget')}</span><select name="widget" aria-label="${message('summary.widget')}">${editWidgets.map(value=>option(value,summaryWidgetLabel(value),p.reportWidget)).join('')}</select></label>`:kind==='report-period'?'':kind==='energy'?`<label class="field-row"><span>${t('chartControls.show')}</span><select name="show" aria-label="${t('chartControls.show')}">${['Consumed','Expenditure','Balance'].map(value=>option(value,message('energy.'+value),p.energyShow)).join('')}</select></label>`:`<label class="field-row"><span>${message('weight.goalTarget')}</span><input type="checkbox" name="target" ${p.weightTarget?'checked':''}></label><label class="field-row"><span>${message('weight.zoom')}</span><input type="checkbox" name="zoom" ${p.weightZoom?'checked':''}></label>`}<footer class="entry-actions"><button class="primary">${t('common.save')}</button></footer></form>`);
  const form=host.querySelector('form');form.elements.range.onchange=()=>host.querySelector('[data-custom-range]').hidden=form.elements.range.value!=='custom';form.onsubmit=async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(form)),patch={[key]:values.range,...(values.range==='custom'?{customFrom:values.from,customTo:values.to}:{}),...(kind==='report-period'?{}:kind==='edit-report'?{reportWidget:values.widget}:kind==='energy'?{energyShow:values.show}:{weightTarget:form.elements.target.checked,weightZoom:form.elements.zoom.checked})};if(await save('dashboard.preferences',{patch},host)){close();if(pendingRefresh){pendingRefresh=false;void load({fresh:true,silent:true});}}};
 }
 async function actionHandler(action){if(action.startsWith('health-')&&onHealth)return onHealth(action.slice(7));if(action.startsWith('health-'))return openDashboardHealthCard(action.slice(7),data.health,{show,header,content,onDiary,close});if(action==='share-streak')openStreakShare(data.capture.cards.streaks??data.streaks,{show,header,content,language});else if(action==='settings')settings();else if(action==='newsfeed')return openDashboardNews({show,close,content,date,news:data?.news});else if(action==='switch-report'){const nextMode=nextWidget(data.summary.widget);if(await save('dashboard.preferences',{patch:{reportWidget:nextMode}},root)&&alive())root.querySelector('[data-discover=switch-report]')?.focus({preventScroll:true});}else if(['energy','weight','edit-report','report-period'].includes(action))rangeSettings(action);else if(action==='streak-stats')streakStats();else if(action==='streak-settings')streakSettings();else if(action==='sleep-data')modal(t('measurementCatalog.metric.sleep'),discoverSleepDetails(data.capture.cards.sleep,language));else if(action==='dismiss-sleep')await save('dashboard.preferences',{patch:{sleepPrompt:false}},root);else if(action==='dismiss-sleep-promo')await save('dashboard.preferences',{patch:{sleepPromotion:false}},root);else if(action==='report')onReport?.();else if(['fasting','new-fast','end-fast','start-now','edit-active-fast','edit-fast-start','edit-fast-goal'].includes(action))onFasting?.(action,data.capture.cards.fasting?.active?.id);else if(action==='weight-log')onWeight?.();else if(action==='connect')onConnect?.();else if(action==='coach')onCoach?.();}

 // Pull-to-refresh inside the Discover Dashboard tab.
 const ptrAbort=new AbortController();
 const ptrThreshold=72;
 function ptrStart(event){
  ptrGesture=null;
  if(ptrRefreshing||!data||event.touches.length!==1||modalOpen()||window.scrollY>2)return;
  const touch=event.touches[0];
  if(navigationEdge(touch.clientX,innerWidth))return;
  ptrGesture={id:touch.identifier,x:touch.clientX,y:touch.clientY,pulling:false,dy:0};
 }
 function ptrMove(event){
  if(!ptrGesture||ptrRefreshing)return;
  if(event.touches.length!==1||modalOpen()){ptrCancel();return;}
  const touch=event.touches[0];
  if(touch.identifier!==ptrGesture.id)return;
  const dx=Math.abs(touch.clientX-ptrGesture.x),dy=touch.clientY-ptrGesture.y;
  if(!ptrGesture.pulling){
   if(dy<0||dx>dy*0.8){ptrCancel();return;}
   if(dy<12)return;
   if(window.scrollY>2){ptrCancel();return;}
   ptrGesture.pulling=true;
  }
  ptrGesture.dy=Math.max(0,dy);
  const height=Math.min(60,ptrGesture.dy*0.48);
  updatePtr(height,ptrGesture.dy>=ptrThreshold?'ready':'pull',true);
 }
 async function ptrEnd(){
  const g=ptrGesture;ptrGesture=null;
  if(!g||!g.pulling)return;
  if(g.dy>=ptrThreshold&&!ptrRefreshing){
   ptrRefreshing=true;
   updatePtr(44,'refreshing',false);
   try{await load({fresh:true,silent:true});}
   finally{ptrRefreshing=false;if(alive())updatePtr(0,'idle',false);}
  }else{
   updatePtr(0,'idle',false);
  }
 }
 function ptrCancel(){ptrGesture=null;if(!ptrRefreshing)updatePtr(0,'idle',false);}
 root.addEventListener('touchstart',ptrStart,{passive:true,signal:ptrAbort.signal});
 root.addEventListener('touchmove',ptrMove,{passive:true,signal:ptrAbort.signal});
 root.addEventListener('touchend',ptrEnd,{passive:true,signal:ptrAbort.signal});
 root.addEventListener('touchcancel',ptrCancel,{passive:true,signal:ptrAbort.signal});

 const stopStatus=onBackgroundWriteStatus(event=>{
  if(!alive()||!data)return;
  if(event.saved&&event.result?.revision)data.revision=event.result.revision;
 });
 const resume=()=>{if(alive()&&document.visibilityState==='visible'&&!modalOpen()&&!ptrRefreshing)void load({silent:true});};
 document.addEventListener('visibilitychange',resume);refreshTimer=setInterval(resume,60000);
 root.innerHTML=`<p class="empty">${t('discover.loading')}</p>`;void load();
 return {reload:()=>load({fresh:true}),openSettings:settings,openNews:()=>actionHandler('newsfeed'),dispose(){disposed=true;generation++;ptrAbort.abort();stopStatus();controller?.abort();chartDetail?.dispose();cgmDetail?.dispose();detailObserver.disconnect();destroyCharts();clearInterval(clockTimer);clearInterval(refreshTimer);document.removeEventListener('visibilitychange',resume);}};
}
