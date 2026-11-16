import {mountRecordEditor} from './records.js';
import {MobileWeightGoal} from './weight-goal-source/mobile-weight-goal.js';
import {MobileEnergyExpenditure} from './expenditure-source/mobile-energy-expenditure.js';
import {escape as e} from './html.js';
import {request,command} from './diary-api.js';
import {MobileNutrientTargets} from './targets-source/mobile-nutrient-targets.js';
import {AnchoredMenu} from './targets-source/anchored-menu.js';
import {formatMessage} from './targets-source/message-format.js';
import {moreIcon} from './more-source/menu-view.js';
import {openTargetPolicies} from './target-policies.js';
import {openProfileSettings} from './profile-settings.js';
import {openDiarySummaryAction} from './diary-summary-actions.js';

const main=['weight','macros','scheduler','expenditure','nutrients','scores'];
const tools=['diary','display','references','body','weekday'];
const m=key=>formatMessage('en','mobileTargets.'+key);

/** Source Targets navigation; account commands and calculations stay server owned. */
export function mountTargets({page,headerRoot,date,show,close,header,content,onChange=async()=>{},onExit}){
 const root=document.createElement('section');root.className='targets-page';page.replaceChildren(root);
 const events=new AbortController();let child=null,menu=null,disposed=false,screen='home',revision,operation=0;
 document.body.classList.add('targets-mobile');
 const alive=()=>!disposed&&root.isConnected;
 const day=()=>typeof date==='function'?date():date;
 const expenditureSession={pending:null,listener:null},weightSession={pending:null,listener:null};
 const ui={date,show,close,header,content,onChange:async()=>{await onChange();if(alive()&&child)await child.load();}};
 function heading(title){headerRoot.innerHTML=`<div class="mm-child-header"><button type="button" data-mt-back aria-label="Back">${moreIcon('chevron-left')}</button><h1>${e(title)}</h1><button type="button" data-mt-menu aria-label="${e(m('tools'))}" aria-haspopup="menu" aria-expanded="false">⋮</button></div>`;}
 function reset(){operation++;menu?.close(false);menu=null;child?.dispose();child=null;}
 function home(){reset();screen='home';heading(m('title'));root.innerHTML=`<section class="mt-home mm-group" data-mt-home>${main.map(id=>`<button type="button" class="mm-row" data-mt-open="${id}"><span>${e(m(id))}</span>${moreIcon('chevron-right','mm-chevron')}</button>`).join('')}</section>`;window.scrollTo(0,0);}
 async function summary(action){
  show(header(action==='choose-scores'?'Nutrition Scores':'Diary Display')+'<p class="empty">Loading…</p>');const marker=content.lastElementChild,current=++operation;
  try{const diary=await request('/api/diary?date='+encodeURIComponent(day()),undefined,events.signal);if(!alive()||current!==operation||!marker.isConnected)return;openDiarySummaryAction({...ui,action,diary,date:day()});}
  catch(error){if(alive()&&marker.isConnected)marker.textContent=error.message;}
 }
 function open(id){
  menu?.close();
  if(id==='weight'){
   reset();screen='weight';heading(m('weight'));root.innerHTML='<div class="mt-section"><div id="mobile-weight-goal-root"></div></div>';window.scrollTo(0,0);
   child=new MobileWeightGoal({root:root.querySelector('#mobile-weight-goal-root'),header:headerRoot,date:day(),language:'en',energyUnit:'kcal',session:weightSession,onSaved:onChange,onNavigate:open,onRecordWeight:initialSelection=>mountRecordEditor({...ui,kind:'biometric',date:day(),initialSelection:initialSelection??{selection:{kind:'catalog',id:'weight'},unit:null}})});return;
  }
  if(id==='expenditure'){
   reset();screen='expenditure';heading(m('expenditure'));root.innerHTML='<div class="mt-section"><div id="mobile-energy-expenditure-root"></div></div>';window.scrollTo(0,0);
   child=new MobileEnergyExpenditure({root:root.querySelector('#mobile-energy-expenditure-root'),header:headerRoot,date:day(),language:'en',energyUnit:'kcal',session:expenditureSession,onSaved:onChange});return;
  }
  if(id==='nutrients'||id==='display'){
   reset();screen='nutrients';heading(m('nutrients'));root.innerHTML='<div class="mt-section"><div id="mobile-nutrient-targets-root"></div></div>';window.scrollTo(0,0);
   child=new MobileNutrientTargets({root:root.querySelector('#mobile-nutrient-targets-root'),header:headerRoot,date:day(),language:'en',onNavigate:open,
    request:async(path,options)=>{const value=await request(path,undefined,options?.signal);revision=value.revision;return value;},
    save:async(type,payload)=>{const value=await command(revision,type,payload);await onChange();return value;}});return;
  }
  if(id==='scores'||id==='diary'){void summary(id==='scores'?'choose-scores':'configure-diary-display');return;}
  if(id==='references'||id==='body'){void openProfileSettings({...ui,initialScreen:id});return;}
  const initialScreen={macros:'macros',scheduler:'schedule',weekday:'weekdays'}[id];
  if(initialScreen)void openTargetPolicies({...ui,initialScreen});
 }
 function back(){if(menu){menu.close();return true;}if(child?.back())return true;if(screen!=='home'){home();return true;}return false;}
 headerRoot.addEventListener('click',event=>{
  if(event.target.closest('[data-mt-back]')){if(!back())onExit();}
  else if(event.target.closest('[data-mt-menu]')){
   const origin=headerRoot.querySelector('[data-mt-menu]');origin.setAttribute('aria-expanded','true');
   menu=new AnchoredMenu({origin,anchor:origin,label:m('tools'),className:'mt-tools-menu',items:tools.map(id=>({id,label:m(id)})),onChoose:open,onClose:()=>{menu=null;origin.setAttribute('aria-expanded','false');}});
  }
 },{signal:events.signal});
 root.addEventListener('click',event=>{const button=event.target.closest('[data-mt-open]');if(button)open(button.dataset.mtOpen);},{signal:events.signal});
 home();return {back,dispose(){disposed=true;reset();events.abort();document.body.classList.remove('targets-mobile');}};
}
