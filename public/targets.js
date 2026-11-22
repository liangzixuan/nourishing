import {dc} from './discover-cloud-messages.js';
import {uiLanguage,t} from './app-language.js';
import {TargetSetupPanel} from './setup-source/target-setup.js';
import {NutrientReferencePanel} from './upper-limits-source/reference-panel.js';
import {upperLimitConfiguration} from './upper-limits-source/nutrient-upper-limits.js';
import {MobileMacroScheduler} from './macro-scheduler-source/mobile-macro-scheduler.js';
import {MobileMacroEnergy} from './macro-energy-source/mobile-macro-energy.js';
import {mountRecordEditor} from './records.js';
import {MobileWeightGoal} from './weight-goal-source/mobile-weight-goal.js';
import {MobileEnergyExpenditure} from './expenditure-source/mobile-energy-expenditure.js';
import {escape as e} from './html.js';
import {request} from './diary-api.js';
import {localWorkspaceView} from './local-engine.js';
import {readDeviceCache} from './device-cache.js';
import {createNutrientTargetsView,projectLocalDiary} from './local-diary-projection.js';
import {saveNutrientTarget} from './nutrient-target-command.js';
import {MobileNutrientTargets} from './targets-source/mobile-nutrient-targets.js';
import {AnchoredMenu} from './targets-source/anchored-menu.js';
import {formatMessage} from './targets-source/message-format.js';
import {moreIcon} from './more-source/menu-view.js';
import {openTargetPolicies} from './target-policies.js';
import {mountProfile,openProfileSettings} from './profile-settings.js';
import {openDiarySummaryAction} from './diary-summary-actions.js';

const main=["weight",'macros','scheduler','expenditure','nutrients','scores'];
const tools=['diary','display','references','limits','body','weekday','guided'];
const m=key=>formatMessage(uiLanguage(),'mobileTargets.'+key);

/** Source Targets navigation; account commands and calculations stay server owned. */
export function mountTargets({page,headerRoot,date,show,close,header,content,onChange=async()=>{},onExit,rootScreen='home',initialScreen=rootScreen,initialNutrient=null}){
 const root=document.createElement('section');root.className='targets-page';page.replaceChildren(root);
 const events=new AbortController();let child=null,menu=null,disposed=false,screen='home',operation=0;
 let returnToMacros=null;
 document.body.classList.add('targets-mobile');
 const alive=()=>!disposed&&root.isConnected;
 const day=()=>typeof date==='function'?date():date;
 const expenditureSession={pending:null,listener:null},weightSession={pending:null,listener:null},macroSession={pending:null,listener:null},schedulerSession={pending:null,listener:null},limitsSession={pending:null,listener:null},setupSession={pending:null,listener:null};
 const ui={date,show,close,header,content,onChange:async()=>{await onChange();if(alive()&&child)await child.load();}};
 function heading(title,withTools=true){headerRoot.innerHTML=`<div class="mm-child-header"><button type="button" data-mt-back aria-label="${t('discover.back')}">${moreIcon('chevron-left')}</button><h1>${e(title)}</h1>${withTools?`<button type="button" data-mt-menu aria-label="${e(m('tools'))}" aria-haspopup="menu" aria-expanded="false">⋮</button>`:'<span></span>'}</div>`;}
 function reset(){operation++;menu?.close(false);menu=null;child?.dispose();child=null;}
 function home(){reset();screen='home';heading(m('title'));root.innerHTML=`<section class="mt-home mm-group" data-mt-home>${main.map(id=>`<button type="button" class="mm-row" data-mt-open="${id}"><span>${e(m(id))}</span>${moreIcon('chevron-right','mm-chevron')}</button>`).join('')}</section>`;window.scrollTo(0,0);}
 async function summary(action){
  show(header(action==='choose-scores'?t('discover.widget.Nutrition Scores'):t('mobileTargets.diary'))+`<p class="empty">${t('mobileNutrientDetail.loading')}</p>`);const marker=content.lastElementChild,current=++operation;
  const selectedDate=day(),ownerTicket=readDeviceCache('/api/diary').then(cached=>cached.ticket);
  try{
   const local=await localWorkspaceView();
   const diary=local?projectLocalDiary(local.state,selectedDate,{revision:local.revision}):await request('/api/diary?date='+encodeURIComponent(selectedDate),undefined,events.signal);
   if(!alive()||current!==operation||!marker.isConnected)return;
   openDiarySummaryAction({...ui,action,diary,date:selectedDate,navigation:'more',ownerTicket});
  }
  catch(error){if(alive()&&marker.isConnected)marker.textContent=error.message;}
 }
 function open(id,macroView){
  menu?.close();
  returnToMacros=null;
  if(id==='profile'){
   reset();screen=id;heading(t('settings.profile'),false);
   window.scrollTo(0,0);child=mountProfile({page:root,date:day,onChange});return;
  }
  if(id==='guided'){
   reset();screen=id;heading(m('guided'));root.innerHTML='<section class="target-setup"></section>';window.scrollTo(0,0);
   child=new TargetSetupPanel({language:uiLanguage(),root:root.firstElementChild,date:day(),session:setupSession,onSaved:onChange});return;
  }
  if(id==='limits'){
   reset();screen=id;heading(m('limits'));root.innerHTML='<div class="mt-section"><section class="card" id="nutrient-upper-limits-root"></section></div>';window.scrollTo(0,0);
   child=new NutrientReferencePanel({root:root.querySelector('#nutrient-upper-limits-root'),date:day(),configuration:upperLimitConfiguration,language:uiLanguage(),session:limitsSession,onSaved:onChange});return;
  }
  if(id==='scheduler'||id==="day"){
   reset();screen=id;heading(m('scheduler'));root.innerHTML='<div class="mt-section"><div id="mobile-macro-scheduler-root"></div></div>';window.scrollTo(0,0);
   child=new MobileMacroScheduler({root:root.querySelector('#mobile-macro-scheduler-root'),header:headerRoot,date:day(),language:uiLanguage(),energyUnit:'kcal',session:schedulerSession,onSaved:onChange,onNavigate:open,onDiary:onExit,initialAction:id==="day"?"day":'home'});return;
  }
  if(id==='macros'){
   reset();screen='macros';heading(m('macros'),false);root.innerHTML='<div class="mt-section"><div id="mobile-macro-energy-root"></div></div>';window.scrollTo(0,0);
   child=new MobileMacroEnergy({root:root.querySelector('#mobile-macro-energy-root'),date:day(),language:uiLanguage(),energyUnit:'kcal',session:macroSession,onSaved:onChange,initialView:macroView,onNavigate:(next,view)=>{open(next);if(screen!=='macros')returnToMacros=view;}});return;
  }
  if(id==="weight"){
   reset();screen="weight";heading(m("weight"));root.innerHTML='<div class="mt-section"><div id="mobile-weight-goal-root"></div></div>';window.scrollTo(0,0);
   child=new MobileWeightGoal({root:root.querySelector('#mobile-weight-goal-root'),header:headerRoot,date:day(),language:uiLanguage(),energyUnit:'kcal',session:weightSession,onSaved:onChange,onNavigate:open,onRecordWeight:initialSelection=>mountRecordEditor({...ui,kind:'biometric',date:day(),initialSelection:initialSelection??{selection:{kind:'catalog',id:"weight"},unit:null}})});return;
  }
  if(id==='expenditure'){
   reset();screen='expenditure';heading(m('expenditure'));root.innerHTML='<div class="mt-section"><div id="mobile-energy-expenditure-root"></div></div>';window.scrollTo(0,0);
   child=new MobileEnergyExpenditure({root:root.querySelector('#mobile-energy-expenditure-root'),header:headerRoot,date:day(),language:uiLanguage(),energyUnit:'kcal',session:expenditureSession,onSaved:onChange});return;
  }
  if(id==='nutrients'||id==='display'){
   reset();screen='nutrients';heading(m('nutrients'));root.innerHTML='<div class="mt-section"><div id="mobile-nutrient-targets-root"></div></div>';window.scrollTo(0,0);
   const owner=readDeviceCache('/api/diary').then(cached=>cached.ticket);let revision;
   child=new MobileNutrientTargets({root:root.querySelector('#mobile-nutrient-targets-root'),header:headerRoot,date:day(),language:uiLanguage(),onNavigate:open,initialNutrient,
    request:async(path,options)=>{const local=await localWorkspaceView();if(local){revision=local.revision;return {revision,...createNutrientTargetsView(local.state,day())};}const value=await request(path,undefined,options?.signal);revision=value.revision;return value;},
    save:(type,payload)=>saveNutrientTarget(owner,revision,type,payload)});return;
  }
  if(id==='scores'||id==='diary'){void summary(id==='scores'?'choose-scores':'configure-diary-display');return;}
  if(id==='references'||id==='body'){void openProfileSettings({...ui,initialScreen:id});return;}
  if(id==='weekday')void openTargetPolicies(ui);
 }
 function back(){if(menu){menu.close();return true;}if(child?.back?.())return true;if(returnToMacros){open('macros',returnToMacros);return true;}if(screen===rootScreen)return false;if(rootScreen==='home')home();else open(rootScreen);return true;}
 headerRoot.addEventListener('click',event=>{
  if(event.target.closest('[data-mt-back]')){if(!back())onExit();}
  else if(event.target.closest('[data-mt-menu]')){
   const origin=headerRoot.querySelector('[data-mt-menu]');origin.setAttribute('aria-expanded','true');
   if(screen==='nutrients'){
    menu=new AnchoredMenu({origin,label:m('tools'),placement:'bottom',bounds:{bottom:document.querySelector('.app-nav')?.getBoundingClientRect().top??innerHeight},className:'mnt-defaults-menu',items:[{id:'restore',label:child.m('restore'),disabled:!child.view||child.loading||child.saving}],onChoose:()=>child.confirmRestore(),onClose:()=>{menu=null;origin.setAttribute('aria-expanded','false');}});
    return;
   }
   menu=new AnchoredMenu({origin,anchor:origin,label:m('tools'),className:'mt-tools-menu',items:tools.map(id=>({id,label:m(id)})),onChoose:open,onClose:()=>{menu=null;origin.setAttribute('aria-expanded','false');}});
  }
 },{signal:events.signal});
 root.addEventListener('click',event=>{const button=event.target.closest('[data-mt-open]');if(button)open(button.dataset.mtOpen);},{signal:events.signal});
 if(initialScreen==='home')home();else open(initialScreen);return {back,dispose(){disposed=true;reset();events.abort();document.body.classList.remove('targets-mobile');}};
}

/** Reuses the same source target child for Diary settings, with the selected date intact. */
export function mountTargetsSheet({date,show,close,header,content,onChange,initialScreen='macros',initialNutrient=null}){
 show('<section class="targets-sheet"><header class="targets-sheet-header"></header><div class="targets-sheet-page"></div></section>');
 const host=content.querySelector('.targets-sheet'),alreadyMobile=document.body.classList.contains('targets-mobile');
 const panel=mountTargets({page:host.querySelector('.targets-sheet-page'),headerRoot:host.querySelector('.targets-sheet-header'),date,show,close,header,content,onChange,initialScreen,initialNutrient,onExit:close});
 return ()=>{panel.dispose();if(alreadyMobile)document.body.classList.add('targets-mobile');};
}
