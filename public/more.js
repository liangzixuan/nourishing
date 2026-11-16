import {escape as e} from './html.js';
import {mountDisplay} from './display.js';
import {mountTargets} from './targets.js';
import {mountFasting} from './fasting.js';
import {mountBackup} from './backup.js';
import {mountRepeats} from './repeats.js';
import {mountProfile} from './profile-settings.js';
import {openImports} from './imports.js';
import {mountReminders} from './reminders.js';
import {openGlucose,openCycle} from './health-controls.js';
import {openExport} from './charts.js';
import {moreRow as row,moreLink as link,moreGroup as group,moreHomeHeader,moreBackHeader} from './more-source/menu-view.js';

const main=[['account','Account','account-cog'],['profile','Profile','account-circle'],['targets','Targets','bullseye'],['fasting','Fasting','timer-outline'],['display','Display','cellphone'],['sharing','Sharing','share'],['support','Support','help-circle'],['about','About','information']];
const tools=[['reminders','Reminders'],['offline','Offline diary'],['repeats','Repeat Items'],['glucose','Glucose Timeline'],['cycle','Cycle Tracking'],['imports','Import CSV'],['export','Export data'],['backup','Backup & Restore']];

/** Adapts the existing More layout to authenticated cloud features. */
export function mountMore({page,headerRoot,date,show,close,header,content,onChange=async()=>{},onDiary,onFoods,onDiscover,identity='My workspace'}){
 let disposed=false,child=null,screen='home',query='',scroll=0,version=0;
 const events=new AbortController(),signal=events.signal,root=document.createElement('section');root.className='more-page';page.replaceChildren(root);
 document.body.classList.add('more-mobile');
 const ui={date,show,close,header,content,onChange,onDiary};
 const alive=()=>!disposed&&root.isConnected;
 const reset=()=>{version++;child?.dispose();child=null;};
 function heading(title){headerRoot.innerHTML=moreBackHeader(title);document.body.classList.add('more-destination');}
 function home(){
  reset();screen='home';document.body.classList.remove('more-destination');headerRoot.innerHTML=moreHomeHeader(identity,query);
  root.innerHTML=group(main.map(([id,label,icon])=>row(id,label,icon)).join(''),'mm-primary')+'<h2 class="mm-tools-title">Workspace tools</h2>'+group(tools.map(([id,label])=>id==='offline'?link(label,'/offline.html'):row(id,label)).join(''),'mm-tools')+'<p class="mm-empty" hidden>No results</p>';
  filter();window.scrollTo(0,scroll);
 }
 function filter(){
  const value=query.trim().toLocaleLowerCase();let visible=0;
  for(const element of root.querySelectorAll('.mm-row')){element.hidden=!!value&&!element.textContent.toLocaleLowerCase().includes(value);if(!element.hidden)visible++;}
  for(const element of root.querySelectorAll('.mm-group'))element.hidden=![...element.children].some(child=>!child.hidden);
  root.querySelector('.mm-tools-title').hidden=root.querySelector('.mm-tools').hidden;
  root.querySelector('.mm-empty').hidden=visible>0;
 }
 function childView(id,title,mount){reset();screen=id;heading(title);root.innerHTML='<div class="mm-destination"></div>';child=mount(root.firstElementChild);window.scrollTo(0,0);}
 function section(id,title,markup){reset();screen=id;heading(title);root.innerHTML=markup;window.scrollTo(0,0);}
 function open(id){
  if(screen==='home')scroll=window.scrollY;
  if(id==='account'){location.assign('/account');return;}
  if(id==='profile')return childView(id,'Profile',host=>mountProfile({...ui,page:host,headerRoot,onExit:home}));
  if(id==='reminders')return childView(id,'Notifications',host=>mountReminders({root:host,...ui}));
  if(id==='glucose')return void openGlucose(ui);
  if(id==='cycle')return void openCycle(ui);
  if(id==='imports')return void openImports(ui);
  if(id==='export')return void openExport(ui);
  if(id==='targets')return childView(id,'Targets',host=>mountTargets({...ui,page:host,headerRoot,onExit:home}));
  if(id==='fasting')return childView(id,'Fasting',host=>mountFasting({...ui,page:host,headerRoot,onBack:home}));
  if(id==='backup')return childView(id,'Backup & Restore',host=>mountBackup({...ui,root:host}));
  if(id==='repeats')return childView(id,'Repeat Items',host=>mountRepeats({...ui,page:host,headerRoot,onExit:home}));
  if(id==='display')return childView(id,'Display',host=>mountDisplay({root:host,headerRoot,onChange}));
  if(id==='foods')return onFoods?.();
  if(id==='reports')return onDiscover?.('report');
  if(id==='sharing')return section(id,'Sharing',group((onFoods?row('foods','Foods & Recipes'):'')+(onDiscover?row('reports','Reports'):'')+row('backup','Backup & Restore')+row('export','Export data')));
  if(id==='support')return section(id,'Support',group(link('User Manual','https://support.cronometer.com/hc/en-us/categories/360001062451-Mobile-App',true)+row('backup','Backup & Restore')+row('reminders','Notifications')));
  if(id==='about')return section(id,'About','<div class="mm-about"><img src="/favicon.svg" alt=""><h2>Nourishing</h2></div>'+group(row('account','Account')+row('backup','Your data')));
 }
 const click=event=>{const button=event.target.closest('[data-more-open]');if(button){event.preventDefault();open(button.dataset.moreOpen);}else if(event.target.closest('[data-more-back]')){event.preventDefault();if(!child?.back?.())home();}};
 headerRoot.addEventListener('click',click,{signal});root.addEventListener('click',click,{signal});
 headerRoot.addEventListener('input',event=>{if(event.target.matches('[data-more-search]')){query=event.target.value;scroll=0;filter();}},{signal});
 home();return {back(){if(screen==='home')return false;if(child?.back?.())return true;home();return true;},dispose(){disposed=true;reset();events.abort();document.body.classList.remove('more-mobile','more-destination');}};
}
