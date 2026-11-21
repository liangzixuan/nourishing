import {uiLanguage,t} from './app-language.js';
import {dc} from './discover-cloud-messages.js';
import {coreText} from './core-cloud-messages.js';
import {nutrientDisplayName} from './report-source/public/nutrient-language.js';
import {escape as e} from './html.js';
import {queueCommand} from './diary-api.js';
import {readDeviceCache} from './device-cache.js';
import {ensureDeviceSnapshot} from './device-sync.js';
import {changeScoreDisplay} from './local-diary-projection.js';
import {bottomNavigation} from './dashboard-source/discover-ui.js';
import {formatMessage} from './diary-summary-source/message-format.js';
import {scoreName,mobileScoreOrder} from './diary-summary-source/score-labels.js';
import {displayValue} from './dashboard-source/energy-display.js';
import {DiaryEnergyRings,energyComponentColors} from './diary-summary-source/energy-rings.js';

const number=value=>Number.isFinite(value)?value.toLocaleString(uiLanguage(),{maximumFractionDigits:1}):'—';
const switchRow=(label,name,checked)=>`<label class="ds-setting"><span>${e(label)}</span><input type="checkbox" role="switch" name="${name}" ${checked?'checked':''}></label>`;
const button=(label,attributes='')=>`<button type="button" ${attributes}>${label}</button>`;

/** Dialog adapter: all calculations and saved settings remain owned by the workspace domain. */
export function openDiarySummaryAction({action,id,diary,date=diary.date,show,close,header,content,onChange,onTargets,onReport,onFasting,navigation='diary',ownerTicket}){
 if(action==='edit-day-targets'){onTargets?.(date);return true;}
 if(action==='all-nutrients'){onReport?.(date);return true;}
 if(action==='open-fasting'){onFasting?.();return true;}
 const present=(title,body)=>{show(header(title)+`<section class="ds-dialog">${body}</section>`);return content.querySelector('.ds-dialog');};
 if(action==='mobile-diary-energy'){
  const {energy,consumedEnergy,expenditureBreakdown}=diary.summary,unit=diary.energyUnit??'kcal';
  const known=Number.isFinite,unknown=t('energyReport.unknown'),amount=value=>known(value)?number(displayValue(value,'kcal',unit))+' '+unit:unknown;
  const intake=t('mobileDiary.consumed'),spent=t('mobileDiary.expenditure'),target=t('mobileDiary.target'),balance=t('energyReport.balance');
  const component=(id,value,percent,missing)=>{
   const color=energyComponentColors[id],swatch=`<svg viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="${['resting','baseline','exercise','tracker','thermicEffect'].includes(id)?0:6}" fill="${e(color)}"/></svg>`;
   return `<div class="ds-energy-row" data-component="${e(id)}"><dt>${swatch}${e(t('energyChart.component.'+id))}</dt><dd>${e(missing??amount(value))}</dd><dd>${known(percent)?number(percent)+'%':''}</dd></div>`;
  };
  const empty=consumedEnergy?.methods&&Object.values(consumedEnergy.methods).every(count=>count===0);
  const consumedRows=['protein','carbohydrate','fat','alcohol','unattributed'].map(id=>{
   const value=known(energy.consumed)?consumedEnergy?.values[id]:null;
   if((id==='alcohol'||id==='unattributed')&&!value)return '';
   return component(id,value,known(value)&&consumedEnergy.total>0?100*value/consumedEnergy.total:null,empty?dc('summaryWhenLogged'):null);
  }).join('');
  const expenseRows=(expenditureBreakdown?.components??[]).filter(row=>['resting','baseline','exercise'].includes(row.id)||row.mean>0).map(row=>component(row.id,row.mean,row.percent)).join('');
  const card=(kind,title,value,rows)=>`<article class="ds-energy-card" data-card="${kind}"><header><h3>${e(title)}</h3><div class="ds-energy-ring"><canvas data-md-ring="${kind}" aria-hidden="true"></canvas><strong>${known(value)?number(displayValue(value,'kcal',unit)):'—'}</strong><small>${known(value)?e(unit):e(unknown)}</small></div></header><dl>${rows}</dl></article>`;
  const budgetRow=(label,value)=>`<div class="ds-budget-row"><dt>${e(label)}</dt><dd>${e(amount(value))}</dd></div>`;
  const budget=mode=>{
   const isBalance=mode==='balance',value=energy[mode],title=isBalance&&known(value)&&value!==0?coreText(value>0?'diary.energyDeficit':'diary.energySurplus'):isBalance?balance:t('mobileDiary.remaining');
   const shown=isBalance&&known(value)?Math.abs(value):value;
   return card(mode,title,shown,budgetRow(isBalance?spent:target,isBalance?energy.expenditure:energy.target)+budgetRow(intake,known(energy.consumed)?-energy.consumed:null)+budgetRow(title,shown));
  };
  let mode=energy.display==='balance'?'balance':'remaining';
  show(`<section class="ds-dialog ds-energy"><header class="sheet-header"><button type="button" data-close aria-label="${e(t('mobileDisplay.back'))}">‹</button><h2 id="sheet-title">${e(coreText('diary.energy'))}</h2><button type="button" data-ds-targets aria-label="${e(coreText('diary.editTargets'))}"><img alt="" src="/record-source/biometric-icons/cog-outline.svg"></button></header>
   ${button(e(coreText('diary.dailyReport')),'data-ds-report')}${card('consumed',intake,energy.consumed,consumedRows)}${card('expenditure',spent,energy.expenditure,expenseRows)}<div data-budget>${budget(mode)}</div>
   <fieldset class="ds-energy-mode"><legend>${e(coreText('diary.energyDisplay'))}</legend><p>${e(t('energySummary.arithmetic'))}</p>${[['remaining',target],['balance',balance]].map(([id,label])=>button(e(label),`data-mode="${id}" aria-pressed="${mode===id}"`)).join('')}</fieldset><p class="md-chart-error" role="status"></p></section>`);
  const root=content.querySelector('.ds-energy'),rings=new DiaryEnergyRings(root);
  const draw=()=>void rings.draw(diary.summary);
  root.querySelector('[data-ds-targets]').onclick=()=>onTargets?onTargets(date):close();
  root.querySelector('[data-ds-report]').onclick=()=>{close();onReport?.(date);};
  root.querySelector('.ds-energy-mode').onclick=event=>{
   const choice=event.target.closest('[data-mode]');if(!choice||choice.dataset.mode===mode)return;
   mode=choice.dataset.mode;root.querySelector('[data-budget]').innerHTML=budget(mode);
   root.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));draw();
  };
  draw();return ()=>rings.clear();
 }
 if(action==='score-details'){
  const score=diary.summary.scores.find(row=>row.id===id);if(!score)return false;
  const m=(key,values)=>formatMessage(uiLanguage(),'mobileScoreDetail.'+key,values),name=scoreName(score),key=['overall','keto','oral','calciumAbsorption','dataQuality'].includes(id)?id:'progress';
  const confidence=id==='dataQuality'?diary.summary.dataQuality?.overall?.rawValue:score.confidence?.value;
  const root=present(`${name}: ${number(score.value)}%`,`<h3>${m('function')}</h3><div class="msd-card">${e(m(key,{name}))}</div><h3>${m('quality')}</h3><div class="msd-card">${e(Number.isFinite(confidence)?m(id==='dataQuality'?'qualityValue':'confidence',{value:number(confidence)+'%'}):m('noConfidence'))}</div>${button(e(m('report')),'data-ds-report class="ds-primary"')}`);
  root.querySelector('[data-ds-report]').onclick=()=>{close();onReport?.(date);};return true;
 }
 if(action!=='configure-diary-display'&&action!=='choose-scores')return false;
 const owner=ownerTicket??readDeviceCache('/api/diary').then(cached=>cached.ticket);
 async function saveSettings(type,payload){
  const ticket=await owner;
  if(!ticket||!await ensureDeviceSnapshot({ownerId:ticket.ownerId}))throw Error(t('mobileNutrientTargets.reopen'));
  return queueCommand(diary.revision,type,payload,{ticket});
 }
 if(action==='configure-diary-display'){
  const settings=diary.presentation.settings,policy=diary.summary.diaryDisplay.policy;
  const root=present(coreText('diary.display'),`<form><fieldset>${switchRow(coreText('diary.energy'),'showEnergy',settings.showEnergy!==false)}${switchRow(coreText('diary.macros'),'showMacros',settings.showMacros!==false)}${switchRow(t('mobileDiary.water'),'showWater',settings.showWater!==false)}${switchRow(coreText('diary.highlights'),'showHighlights',policy.showHighlights)}<label class="ds-setting"><span>${e(coreText('diary.macroDisplay'))}</span><select name="macroDisplay"><option value="consumed" ${policy.macroDisplay==='consumed'?'selected':''}>${e(t('mobileDiary.consumed'))}</option><option value="remaining" ${policy.macroDisplay==='remaining'?'selected':''}>${e(t('mobileDiary.remaining'))}</option></select></label><h3>${e(coreText('diary.highlights'))}</h3>${Array.from({length:8},(_,index)=>`<label class="ds-setting"><span>${index+1}</span><select name="highlight-${index}" aria-label="${e(coreText('diary.highlight',{index:index+1}))}"><option value="">${e(t('settings.none'))}</option>${diary.presentation.nutrientOptions.map(row=>`<option value="${e(row.id)}" ${policy.highlighted[index]===row.id?'selected':''}>${e(nutrientDisplayName(row,uiLanguage()))}</option>`).join('')}</select></label>`).join('')}<p role="alert" data-error></p><button type="submit" class="ds-primary">${e(t('common.save'))}</button></fieldset></form>`);
  root.insertAdjacentHTML('beforeend',button(t('mobileScoreSettings.title'),'data-ds-scores class="ds-primary"'));
  root.querySelector('[data-ds-scores]').onclick=()=>openDiarySummaryAction({action:'choose-scores',diary,date,show,close,header,content,onChange,onTargets,onReport,onFasting,navigation,ownerTicket:owner});
  const form=root.querySelector('form');form.onsubmit=async event=>{event.preventDefault();const controls=form.elements,highlighted=Array.from({length:8},(_,index)=>controls['highlight-'+index].value).filter(Boolean);root.querySelector('[data-error]').textContent='';form.querySelector('fieldset').disabled=true;
   try{await saveSettings('diaryDisplay.save',{showEnergy:controls.showEnergy.checked,showMacros:controls.showMacros.checked,showWater:controls.showWater.checked,diaryDisplay:{version:1,highlighted,showHighlights:controls.showHighlights.checked,macroDisplay:controls.macroDisplay.value}});if(!root.isConnected)return;close();await onChange?.();}catch(error){if(root.isConnected){root.querySelector('[data-error]').textContent=error.message;form.querySelector('fieldset').disabled=false;}}
  };return true;
 }
 if(action==='choose-scores'){
  let display=diary.presentation.scoreDisplay,slot=null,busy=false;
  show('<section class="ds-dialog mss-screen"></section>');const root=content.querySelector('.mss-screen');let help=false;

  function backToList(){
   if(slot===null)return false;
   const previous=slot;
   if(!busy){slot=null;render();root.querySelector(`[data-slot="${previous}"]`)?.focus();}
   return true;
  }
  const events=new AbortController(),dialog=root.closest('dialog');
  const handleBack=event=>{if(root.isConnected&&backToList()){event.preventDefault();event.stopImmediatePropagation();}};
  dialog?.addEventListener('cancel',handleBack,{capture:true,signal:events.signal});
  window.addEventListener('nourishing-back',handleBack,{capture:true,signal:events.signal});
  const observer=new MutationObserver(()=>{if(!root.isConnected){events.abort();observer.disconnect();}});
  observer.observe(content,{childList:true});
  const render=()=>{const scores=diary.summary.scores;
   const choice=row=>button(`<span>${e(scoreName(row))}</span>${display.selected[slot]===row.id?'<span class="mss-selected" aria-hidden="true">✓</span>':''}`,`data-choice="${e(row.id)}" ${slot==='add'&&display.selected.includes(row.id)?'disabled':''}`);
   const main=mobileScoreOrder.map(id=>scores.find(row=>row.id===id)).filter(Boolean),extra=scores.filter(row=>!mobileScoreOrder.includes(row.id));root.innerHTML=`<header class="sheet-header"><button type="button" class="icon-button" data-back aria-label="${e(t('mobileDisplay.back'))}"><img src="/more-source/icons/chevron-left.svg" alt=""></button><h2 id="sheet-title">${e(t('mobileScoreSettings.title'))}</h2>${slot===null?button('<img src="/report-mobile-source/score-icons/help-circle-outline.svg" alt="">',`data-help aria-label="${e(t('mobileScoreSettings.help'))}" aria-expanded="${help}"`):'<span></span>'}</header>${help?`<p class="mss-hint">${e(dc('scoreHelp'))}</p>`:''}<fieldset ${busy?'disabled':''}>${slot===null?`${switchRow(t('mobileScoreSettings.show'),'showScores',display.show)}<h3>${e(t('mobileScoreSettings.selected'))}</h3><section class="ds-list">${display.selected.map((id,index)=>button(`<span>${e(scoreName(scores.find(row=>row.id===id)))}</span><span aria-hidden="true">›</span>`,`data-slot="${index}"`)).join('')}${display.selected.length<8?button(t('mobileScoreSettings.add'),'data-slot="add"'):''}</section><p class="mss-hint">${e(t('mobileScoreSettings.hint'))}</p>`:`<section class="ds-list">${main.map(choice).join('')}</section>${extra.length?`<details class="mss-other"><summary>${e(t('mobileScoreSettings.other'))}</summary><section class="ds-list">${extra.map(choice).join('')}</section></details>`:''}${slot!=='add'&&display.selected.length>1?button(t('mobileScoreSettings.remove'),'data-remove class="ds-primary"'):''}`}<p data-error role="alert"></p></fieldset><nav class="dc-bottom" aria-label="${e(t('discover.nav.main'))}">${bottomNavigation(navigation,uiLanguage())}</nav>`;
   root.querySelector('[name=showScores]')?.addEventListener('change',event=>save({kind:'show',show:event.target.checked}));};
  const save=async change=>{
   if(busy)return;
   busy=true;render();
   try{
    const desired=changeScoreDisplay(display,change);
    await saveSettings('scoreDisplay.change',{base:display,change});
    if(!root.isConnected)return;
    display=desired;slot=null;busy=false;render();
   }catch(error){
    if(root.isConnected){busy=false;render();root.querySelector('[data-error]').textContent=error.message;}
    return;
   }
   try{await onChange?.();}catch{/* The durable change is already available to the next local read. */}
  };
  root.onclick=event=>{if(busy)return;const target=event.target.closest('button');if(!target)return;if(target.dataset.discover){close();document.querySelector(`.app-nav [data-discover="${target.dataset.discover}"]`)?.click();return;}if(target.hasAttribute('data-help')){help=!help;render();}else if(target.hasAttribute('data-slot')){help=false;slot=target.dataset.slot==='add'?'add':Number(target.dataset.slot);render();}else if(target.hasAttribute('data-back')){if(!backToList())close();}else if(target.hasAttribute('data-choice'))void save(slot==='add'?{kind:'add',scoreId:target.dataset.choice}:{kind:'replace',index:slot,scoreId:target.dataset.choice});else if(target.hasAttribute('data-remove'))void save({kind:'remove',index:slot});};render();return true;
 }
 return false;
}
