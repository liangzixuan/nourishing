import {uiLanguage,t} from './app-language.js';
import {coreText} from './core-cloud-messages.js';
import {nutrientDisplayName} from './report-source/public/nutrient-language.js';
import {escape as e} from './html.js';
import {command,request} from './diary-api.js';
import {formatMessage} from './diary-summary-source/message-format.js';
import {scoreName} from './diary-summary-source/score-labels.js';
import {displayValue} from './dashboard-source/energy-display.js';

const number=value=>Number.isFinite(value)?value.toLocaleString(uiLanguage(),{maximumFractionDigits:1}):'—';
const switchRow=(label,name,checked)=>`<label class="ds-setting"><span>${e(label)}</span><input type="checkbox" role="switch" name="${name}" ${checked?'checked':''}></label>`;
const button=(label,attributes='')=>`<button type="button" ${attributes}>${label}</button>`;

/** Dialog adapter: all calculations and saved settings remain owned by the workspace domain. */
export function openDiarySummaryAction({action,id,diary,date=diary.date,show,close,header,content,onChange,onTargets,onReport,onFasting}){
 if(action==='edit-day-targets'){onTargets?.(date);return true;}
 if(action==='all-nutrients'){onReport?.(date);return true;}
 if(action==='open-fasting'){onFasting?.();return true;}
 const present=(title,body)=>{show(header(title)+`<section class="ds-dialog">${body}</section>`);return content.querySelector('.ds-dialog');};
 if(action==='mobile-diary-energy'){
  const energy=diary.summary.energy,unit=diary.energyUnit??'kcal',rows=[[t('mobileDiary.consumed'),energy.consumed],[t('mobileDiary.expenditure'),energy.expenditure],[t('mobileDiary.target'),energy.target],[t('mobileDiary.remaining'),energy.remaining]];
  const root=present(coreText('diary.energy'),`<dl class="ds-energy">${rows.map(([label,value])=>`<div><dt>${label}</dt><dd>${number(displayValue(value,'kcal',unit))} ${e(unit)}</dd></div>`).join('')}</dl>${button(coreText('diary.editTargets'),'data-ds-targets class="ds-primary"')}`);
  root.querySelector('[data-ds-targets]').onclick=()=>{close();onTargets?.(date);};return true;
 }
 if(action==='score-details'){
  const score=diary.summary.scores.find(row=>row.id===id);if(!score)return false;
  const m=(key,values)=>formatMessage(uiLanguage(),'mobileScoreDetail.'+key,values),name=scoreName(score),key=['overall','keto','oral','calciumAbsorption','dataQuality'].includes(id)?id:'progress';
  const confidence=id==='dataQuality'?diary.summary.dataQuality?.overall?.rawValue:score.confidence?.value;
  const root=present(`${name}: ${number(score.value)}%`,`<h3>${m('function')}</h3><div class="msd-card">${e(m(key,{name}))}</div><h3>${m('quality')}</h3><div class="msd-card">${e(Number.isFinite(confidence)?m(id==='dataQuality'?'qualityValue':'confidence',{value:number(confidence)+'%'}):m('noConfidence'))}</div>${button(e(m('report')),'data-ds-report class="ds-primary"')}`);
  root.querySelector('[data-ds-report]').onclick=()=>{close();onReport?.(date);};return true;
 }
 if(action==='configure-diary-display'){
  const settings=diary.presentation.settings,policy=diary.summary.diaryDisplay.policy;
  const root=present(coreText('diary.display'),`<form><fieldset>${switchRow(coreText('diary.energy'),'showEnergy',settings.showEnergy!==false)}${switchRow(coreText('diary.macros'),'showMacros',settings.showMacros!==false)}${switchRow(t('mobileDiary.water'),'showWater',settings.showWater!==false)}${switchRow(coreText('diary.highlights'),'showHighlights',policy.showHighlights)}<label class="ds-setting"><span>${e(coreText('diary.macroDisplay'))}</span><select name="macroDisplay"><option value="consumed" ${policy.macroDisplay==='consumed'?'selected':''}>${e(t('mobileDiary.consumed'))}</option><option value="remaining" ${policy.macroDisplay==='remaining'?'selected':''}>${e(t('mobileDiary.remaining'))}</option></select></label><h3>${e(coreText('diary.highlights'))}</h3>${Array.from({length:8},(_,index)=>`<label class="ds-setting"><span>${index+1}</span><select name="highlight-${index}" aria-label="${e(coreText('diary.highlight',{index:index+1}))}"><option value="">${e(t('settings.none'))}</option>${diary.presentation.nutrientOptions.map(row=>`<option value="${e(row.id)}" ${policy.highlighted[index]===row.id?'selected':''}>${e(nutrientDisplayName(row,uiLanguage()))}</option>`).join('')}</select></label>`).join('')}<p role="alert" data-error></p><button type="submit" class="ds-primary">${e(t('common.save'))}</button></fieldset></form>`);
  root.insertAdjacentHTML('beforeend',button(t('mobileScoreSettings.title'),'data-ds-scores class="ds-primary"'));
  root.querySelector('[data-ds-scores]').onclick=()=>openDiarySummaryAction({action:'choose-scores',diary,date,show,close,header,content,onChange,onTargets,onReport,onFasting});
  const form=root.querySelector('form');form.onsubmit=async event=>{event.preventDefault();const controls=form.elements,highlighted=Array.from({length:8},(_,index)=>controls['highlight-'+index].value).filter(Boolean);root.querySelector('[data-error]').textContent='';form.querySelector('fieldset').disabled=true;
   try{await command(diary.revision,'diaryDisplay.save',{showEnergy:controls.showEnergy.checked,showMacros:controls.showMacros.checked,showWater:controls.showWater.checked,diaryDisplay:{version:1,highlighted,showHighlights:controls.showHighlights.checked,macroDisplay:controls.macroDisplay.value}});if(!root.isConnected)return;close();await onChange?.();}catch(error){if(root.isConnected){root.querySelector('[data-error]').textContent=error.message;form.querySelector('fieldset').disabled=false;}}
  };return true;
 }
 if(action==='choose-scores'){
  let current=diary,slot=null,busy=false;
  const root=present(t('mobileScoreSettings.title'),'');
  const render=()=>{const display=current.presentation.scoreDisplay,scores=current.summary.scores;root.innerHTML=`<div class="mss-screen"><fieldset ${busy?'disabled':''}>${slot===null?`${switchRow(t('mobileScoreSettings.show'),'showScores',display.show)}<h3>${e(t('mobileScoreSettings.selected'))}</h3><section class="ds-list">${display.selected.map((id,index)=>button(`<span>${e(scoreName(scores.find(row=>row.id===id)))}</span><span aria-hidden="true">›</span>`,`data-slot="${index}"`)).join('')}${display.selected.length<8?button(t('mobileScoreSettings.add'),'data-slot="add"'):''}</section>`:`${button(t('mobileDisplay.back'),'data-back')}<section class="ds-list">${scores.map(row=>button(`<span>${e(scoreName(row))}</span>${display.selected[slot]===row.id?'<span aria-hidden="true">✓</span>':''}`,`data-choice="${e(row.id)}" ${slot==='add'&&display.selected.includes(row.id)?'disabled':''}`)).join('')}</section>${slot!=='add'&&display.selected.length>1?button(t('mobileScoreSettings.remove'),'data-remove class="ds-primary"'):''}`}<p data-error role="alert"></p></fieldset></div>`;
   root.querySelector('[name=showScores]')?.addEventListener('change',event=>save({kind:'show',show:event.target.checked}));};
  const save=async change=>{if(busy)return;busy=true;render();try{await command(current.revision,'scoreDisplay.change',{base:current.presentation.scoreDisplay,change});const refreshed=await request('/api/diary?date='+encodeURIComponent(date));if(!root.isConnected)return;current=refreshed;slot=null;await onChange?.();}catch(error){if(root.isConnected)root.querySelector('[data-error]').textContent=error.message;busy=false;root.querySelector('fieldset')?.removeAttribute('disabled');return;}busy=false;if(root.isConnected)render();};
  root.onclick=event=>{if(busy)return;const target=event.target.closest('button');if(!target)return;if(target.hasAttribute('data-slot')){slot=target.dataset.slot==='add'?'add':Number(target.dataset.slot);render();}else if(target.hasAttribute('data-back')){slot=null;render();}else if(target.hasAttribute('data-choice'))void save(slot==='add'?{kind:'add',scoreId:target.dataset.choice}:{kind:'replace',index:slot,scoreId:target.dataset.choice});else if(target.hasAttribute('data-remove'))void save({kind:'remove',index:slot});};render();return true;
 }
 return false;
}
