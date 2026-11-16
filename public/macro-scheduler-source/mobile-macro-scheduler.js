import {ketoMessage,ketoProgramItems,ketoProgramButton,ketoSourceSlot,paintKetoSource,ketoDetailsMarkup} from '../macro-energy-source/mobile-keto-controls.js';
import {escape as e} from '../html.js';
import {moreIcon} from '../more-source/menu-view.js';
import {formatMessage} from '../report-source/public/message-format.js';
import {AnchoredMenu} from '../targets-source/anchored-menu.js';
import {LibraryReviewDialog} from '../targets-source/library-review-dialog.js';
import {TargetControlScreen,captureMacroSchedule} from '../macro-scheduler.js';
import {request as cloudRequest} from '../diary-api.js';
import {validateMacroTargets} from '../macro-energy-source/macro-capture.js';
import {macroKeys,templateDraft,draftSettings,shownMacroInput,storeMacroInput,setKetoProgram} from '../macro-energy-source/mobile-macro-draft.js';
import {KETO_PRESETS,MACRO_ENERGY_DENSITY} from '../report-source/server/macro-policy.mjs';
import {convertEnergy} from '../report-source/server/energy-units.mjs';
const icon=(path,cls='')=>`<img class="${cls}" src="${path}" alt="">`;
const dots=()=>icon('/macro-energy-source/dots-vertical.svg');
const closeIcon=()=>icon('/weight-goal-source/close.svg');
const plus=()=>icon('/shell-source/navigation/plus.svg');
const weekday=(index,language)=>new Intl.DateTimeFormat(language,{weekday:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2026,10,1+index,12)));
export class MobileMacroScheduler extends TargetControlScreen{
 constructor({root,header,language,energyUnit,date,request,session,onSaved,onNotice,onNavigate,onDiary,initialAction='create'}){
  super();Object.assign(this,{root,header,language,energyUnit,date,request,session,onSaved,onNotice,onNavigate,onDiary});this.m=key=>formatMessage(language,'mobileMacroScheduler.'+key);this.t=(key,values)=>formatMessage(language,'templateEditor.'+key,values);this.shared=key=>formatMessage(language,'macroEditor.'+key);this.events=new AbortController();this.busy=false;this.error='';this.saved=null;this.draft=null;this.disposed=false;this.startedFromDiary=initialAction==='day';this.initialAction=initialAction;
  this.onSaved=async()=>{this.draft=null;try{await onSaved?.();}finally{if(this.startedFromDiary&&!this.disposed)this.onDiary();}};
  try{this.tipHidden=localStorage.getItem('nourishing-macro-scheduler-tip')==='hidden'}catch{this.tipHidden=false}
  root.addEventListener('click',event=>this.click(event),{signal:this.events.signal});root.addEventListener('input',event=>this.input(event,false),{signal:this.events.signal});root.addEventListener('change',event=>this.input(event,true),{signal:this.events.signal});root.addEventListener('submit',event=>{event.preventDefault();void this.saveEditor()},{signal:this.events.signal});header.addEventListener('click',event=>{if(event.target.closest('[data-mts-save]'))void this.saveEditor()},{signal:this.events.signal});
  this.listener=(event)=>{if(this.disposed)return;if(event==='saved'||event==='rejected')void this.load();else this.render();};session.listener=this.listener;void this.load();
 }
 button(text,attributes=''){return `<button type="button" ${attributes}>${text}</button>`}
 label(key){return key==='carbohydrate'?formatMessage(this.language,'macroCapture.'+(this.saved.summary.macroTargets.carbohydrateTargetId==='netCarbohydrate'?'net':'total')):formatMessage(this.language,'targetSetup.macro.'+key)}
 number(value){return value===null||value===undefined?this.m('notSet'):Number(value).toLocaleString(this.language,{maximumFractionDigits:2})}
 async load(){
  this.readController?.abort();const controller=new AbortController();this.readController=controller;this.busy=true;this.error='';this.render();
  try{const view=await cloudRequest('/api/target-policies?'+new URLSearchParams({date:this.date}),undefined,controller.signal);if(this.disposed||controller.signal.aborted)return;this.saved=captureMacroSchedule(view,this.date,this.language);this.energyUnit=view.energyUnit}catch(error){if(!this.disposed&&!controller.signal.aborted)this.error=error.message}finally{if(!this.disposed&&this.readController===controller){this.busy=false;this.render();if(this.saved&&this.initialAction==='day'&&!this.session.pending){this.initialAction=null;this.pickDay();}}}
 }
 headerMarkup(){
  const editing=!!this.draft;document.body.classList.toggle('mts-editing',editing);
  this.header.innerHTML=`<div class="mm-child-header mts-header"><button type="button" data-mt-back aria-label="${e(editing?this.m('cancel'):formatMessage(this.language,'mobileTargets.back'))}">${editing?closeIcon():moreIcon('chevron-left')}</button><h1>${e(editing?(this.draft.day?this.m('day'):this.m(this.draft.editing?'edit':'new')):this.m('title'))}</h1>${editing?this.button(e(this.m('save')),'class="mts-save" data-mts-save'):'<span></span>'}</div>`;
 }
 render(){
  if(this.disposed)return;this.headerMarkup();const pending=this.session.pending,locked=this.busy||!!pending;
  const status=this.error||pending?.phase==='unknown'?`<p role="alert">${e(pending?.phase==='unknown'?this.t('unknownSave'):this.error)}</p>`:this.busy?`<p role="status">${e(this.t(pending?'saving':'loading'))}</p>`:'';
  this.root.innerHTML=`<section class="mts-screen" ${this.saved&&!this.draft&&!locked?'data-mts-ready':''}><div class="mts-status">${status}${pending?.phase==='unknown'?this.button(e(this.t('retry')),'data-mts-retry'):this.error?this.button(e(this.t('reload')),'data-mts-reload'):''}</div>${this.saved?`<fieldset class="mts-owner" ${locked?'disabled':''}>${this.draft?this.editorMarkup():this.homeMarkup()}</fieldset>`:''}</section>`;
  this.controls();if(this.draft&&!locked)void this.calculate();
 }
 controls(){const save=this.header.querySelector('[data-mts-save]');if(save)save.disabled=this.busy||!!this.session.pending||(!this.draft?.day&&!this.draft?.name.trim())}
 homeMarkup(){const m=this.m,view=this.saved;return `${this.tipHidden?'':`<aside class="mts-tip"><div><strong>${e(m('title'))}</strong><p>${e(m('hint'))}</p>${this.button(e(m('defaultSettings')),'class="mts-link" data-mts-defaults')}</div>${this.button(closeIcon(),`class="mts-icon" data-mts-dismiss aria-label="${e(m('dismiss'))}"`)}</aside>`}<div class="mts-card mts-enable"><strong>${e(m('enabled'))}</strong>${this.button(moreIcon('help-circle'),`class="mts-icon" data-mts-help="enabled" aria-label="${e(m('help'))}"`)}<input type="checkbox" role="switch" class="dc-switch" data-mts-enabled aria-label="${e(m('enabled'))}" ${view.schedule.enabled?'checked':''}></div><details class="mts-card mts-templates" open><summary><strong>${e(m('templates'))}</strong>${moreIcon('chevron-right','mts-up')}</summary>${view.plan.templates.length?view.plan.templates.map(t=>this.button(`<span>${e(t.name)}</span>${moreIcon('chevron-right')}`,`class="mm-row" data-mts-template="${e(t.id)}"`)).join(''):`<p class="mts-empty">${e(m('empty'))}</p>`}${this.button(plus()+e(m('add')),'class="mts-add" data-mts-add')}</details><section class="mts-card"><div class="mts-heading"><strong>${e(m('scheduler'))}</strong>${this.button(dots(),`class="mts-icon" data-mts-schedule-menu aria-label="${e(m('menu'))}"`)}</div>${view.schedule.days.map((id,i)=>this.button(`<strong>${e(weekday(i,this.language))}</strong><span>${e(view.plan.templates.find(t=>t.id===id)?.name??m('defaults'))}</span>${moreIcon('chevron-right')}`,`class="mm-row mts-weekday" data-mts-weekday="${i}" ${!view.schedule.enabled?'disabled':''}`)).join('')}</section>`}
 inputMarkup(name,value,label,{unit='',disabled=false,required=false}={}){return `<label class="mts-input-row"><span>${e(label)}</span><input name="${name}" aria-label="${e(label)}" type="number" min="0" step="any" inputmode="decimal" value="${e(value??'')}" ${disabled?'disabled':''} ${required?'required':''}>${unit?`<span>${e(unit)}</span>`:''}</label>`}
 editorMarkup(){
  const d=this.draft,m=this.m,unit=d.mode==='fixed'?(d.fixedUnit==='grams'?'g':this.energyUnit):d.ratios.basis==='percent'?'%':d.ratios.basis==='grams'?'g':this.energyUnit;
  const rows=macroKeys.map(key=>`<div class="mts-macro-row"><span class="mts-macro-name mts-${key}">${e(this.label(key))} <small data-mts-derived="${key}"></small></span><strong data-mts-energy="${key}"></strong><input name="${key}" aria-label="${e(this.label(key))}" type="number" inputmode="decimal" min="0" step="any" ${d.mode==='ratios'?'required':''} value="${e(shownMacroInput(d,key,this.energyUnit)??'')}"><span>${e(unit)}</span></div>`).join('');
  const preset=KETO_PRESETS[d.keto.program];
  const keto=`${ketoProgramButton(this.language,d.keto.program)}${ketoSourceSlot()}${this.inputMarkup('leanBodyMassKg',d.keto.leanBodyMassKg,this.shared('lean'))}${this.inputMarkup('proteinPerKg',d.keto.proteinPerKg,this.shared('factor'),{unit:'g',disabled:!!preset,required:true})}${this.inputMarkup('carbohydrateGrams',d.keto.carbohydrateGrams,this.t('baseCarbs'),{unit:'g',disabled:!!preset,required:true})}<label class="mts-switch-row"><span>${e(this.shared('bonus'))}</span><input type="checkbox" role="switch" class="dc-switch" name="athleticBonus" ${d.keto.athleticBonus?'checked':''}></label><label class="mts-input-row"><span>${e(this.shared('addition'))}</span><select name="proteinAddition">${[0,25].map(v=>`<option value="${v}" ${d.keto.proteinAddition===v?'selected':''}>${e(this.shared(v===0?'addition.none':'addition.25'))}</option>`).join('')}</select></label>`;
  return `<form data-mts-form>${d.day?'':`<label class="mts-card mts-name"><span>${e(m('name'))}<b> *</b></span><input name="templateName" aria-label="${e(m('name'))}" maxlength="120" required value="${e(d.name)}"></label>`}<section class="mts-card"><div class="mts-heading"><strong>${e(m('method'))}</strong>${this.button(moreIcon('help-circle'),`class="mts-icon" data-mts-help="method" aria-label="${e(m('help'))}"`)}${!d.day&&d.editing?this.button(dots(),`class="mts-icon mts-more" data-mts-template-menu aria-label="${e(m('menu'))}"`):''}</div><div class="mts-segments" role="group" aria-label="${e(m('method'))}">${['ratios','fixed','keto'].map(mode=>this.button(e(m(mode)),`data-mts-mode="${mode}" aria-pressed="${mode===d.mode}"`)).join('')}</div><div class="mts-heading"><strong>${e(m(d.mode==='fixed'?'fixedTitle':d.mode==='ratios'?'ratioTitle':'ketoTitle'))}</strong></div>${d.mode==='keto'?keto:rows}<div class="mts-total"><strong>${e(m('total'))}</strong><strong data-mts-total></strong></div></section><section class="mts-card"><label class="mts-switch-row"><strong>${e(m('customEnergy'))}</strong><input type="checkbox" name="energyCustom" role="switch" class="dc-switch" ${d.energy.mode==='fixed'?'checked':''}></label>${d.energy.mode==='fixed'?this.inputMarkup('energyValue',convertEnergy(d.energy.kcal,'kcal',this.energyUnit),this.t('energy'),{unit:this.energyUnit,required:true}):''}</section>${d.mode!=='keto'?`<fieldset class="mts-card mts-unit-options"><legend>${e(m('units'))}</legend>${(d.mode==='fixed'?['kcal','grams']:['percent','kcal','grams']).map(id=>`<label><input type="radio" name="units" value="${id}" ${(d.mode==='fixed'?d.fixedUnit:d.ratios.basis)===id?'checked':''}><span>${e(id==='kcal'?this.energyUnit:m(id))}</span></label>`).join('')}</fieldset>`:''}<p class="mts-preview-note" data-mts-calculation-note role="status"></p></form>`;
 }
 readInputs(){const form=this.root.querySelector('[data-mts-form]'),d=this.draft;if(!form||!d)return;const f=form.elements,num=name=>f[name]?.value===''?null:Number(f[name]?.value);
  if(f.templateName)d.name=f.templateName.value;
  if(d.mode!=='keto')for(const key of macroKeys)storeMacroInput(d,key,num(key),this.energyUnit);
  else{for(const key of ['leanBodyMassKg','proteinPerKg','carbohydrateGrams'])d.keto[key]=num(key);d.keto.athleticBonus=f.athleticBonus.checked;d.keto.proteinAddition=Number(f.proteinAddition.value)}
  if(d.energy.mode==='fixed'&&f.energyValue)d.energy.kcal=num('energyValue')===null?null:convertEnergy(num('energyValue'),this.energyUnit,'kcal');
 }
 input(event,commit){
  if(this.busy||this.session.pending)return;const el=event.target;
  if(el.matches('[data-mts-enabled]')){if(commit)void this.perform({kind:'enabled',enabled:el.checked});return}
  if(!el.closest('[data-mts-form]'))return;this.readInputs();this.controls();if(el.name==='templateName')return;if(!commit){this.cancelCalculation();this.clearCalculation();return;}
  if(el.name==='units'){if(this.draft.mode==='fixed')this.draft.fixedUnit=el.value;else this.draft.ratios.basis=el.value;this.render();return}
  if(el.name==='energyCustom'){this.draft.energy=el.checked?{mode:'fixed',kcal:this.saved.summary.macroTargets.energyTarget}:{mode:'inherit'};this.render();return}
  void this.calculate();
 }
 cancelCalculation(){clearTimeout(this.calculationTimer);this.calculationVersion=(this.calculationVersion??0)+1;}
 calculate(){
  this.cancelCalculation();this.clearCalculation();if(!this.draft||this.disposed)return;
  const version=this.calculationVersion;this.calculationTimer=setTimeout(()=>void this.calculateLatest(version),150);
 }
 async calculateLatest(version){
  if(this.calculationWork)await this.calculationWork;
  if(this.disposed||!this.draft||this.busy||version!==this.calculationVersion)return;
  const work=this.fetchCalculation(version);this.calculationWork=work;await work;if(this.calculationWork===work)this.calculationWork=null;
 }
 async fetchCalculation(version){
  let settings;try{settings=draftSettings(this.draft)}catch{return}
  const controller=new AbortController();this.calcController=controller;
  try{const value=await cloudRequest('/api/target-policies/template-preview',{date:this.date,settings},controller.signal);if(this.disposed||controller.signal.aborted||version!==this.calculationVersion||!this.draft)return;if(value.date!==this.date||value.revision!==this.saved.revision)throw Error(this.t('responseIncomplete'));this.paintCalculation(validateMacroTargets(value.macroTargets,this.language));}
  catch(error){if(!this.disposed&&!controller.signal.aborted&&version===this.calculationVersion){const note=this.root.querySelector('[data-mts-calculation-note]');if(note)note.textContent=error.message}}
  finally{if(this.calcController===controller)this.calcController=null;}
 }
 async perform(change){
  if(this.busy||this.session.pending)return;this.cancelCalculation();const version=this.calculationVersion;this.busy=true;this.render();
  if(this.calculationWork)await this.calculationWork;
  this.busy=false;if(this.disposed)return;if(version!==this.calculationVersion){this.render();return;}await super.perform(change);
 }
 clearCalculation(){this.calculation=null;paintKetoSource(this.root,null,this.language);for(const el of this.root.querySelectorAll('[data-mts-derived],[data-mts-energy],[data-mts-total]')){el.textContent='';delete el.dataset.value}}
 paintCalculation(value){this.calculation=value;paintKetoSource(this.root,value,this.language);
  const d=this.draft,amounts=value.targets,energy=macroKeys.map(key=>amounts[key]===null?null:amounts[key]*MACRO_ENERGY_DENSITY[key]),total=energy.some(v=>v===null)?null:energy.reduce((sum,v)=>sum+v,0);
  for(const [i,key]of macroKeys.entries()){const target=this.root.querySelector('[data-mts-derived="'+key+'"]'),cal=this.root.querySelector('[data-mts-energy="'+key+'"]');if(target){target.dataset.value=String(amounts[key]??'');target.textContent=d.mode==='fixed'?this.number(total&&energy[i]!==null?energy[i]/total*100:null)+' %':this.number(amounts[key])+' g'}if(cal)cal.textContent=this.number(convertEnergy(energy[i],'kcal',this.energyUnit))+' '+this.energyUnit}
  const totalEl=this.root.querySelector('[data-mts-total]');if(totalEl)totalEl.textContent=d.mode==='ratios'&&d.ratios.basis==='percent'?this.number(macroKeys.reduce((sum,key)=>sum+d.ratios.values[key],0))+' %':this.number(convertEnergy(total,'kcal',this.energyUnit))+' '+this.energyUnit;
  const note=this.root.querySelector('[data-mts-calculation-note]');if(note)note.textContent='';
 }
 dialog(title,html,onClose){
  this.popup?.close();this.popup=new LibraryReviewDialog({title,closeLabel:this.m('cancel'),loading:'',onClose:()=>{this.popup=null;onClose?.()}});this.popup.root.classList.add('mts-dialog');this.popup.show(html);return this.popup;
 }
 confirm(title,message,action,onCancel){let confirmed=false;const dialog=this.dialog(title,`<p>${e(message)}</p>${this.button(e(this.m('confirm')),'class="mts-confirm" data-mts-confirm')}`,()=>{if(!confirmed&&!this.disposed)onCancel?.()});dialog.root.querySelector('[data-mts-confirm]').onclick=()=>{confirmed=true;dialog.close();void action()}}
 menuFor(origin,items,choose){this.menu?.close();origin.setAttribute('aria-expanded','true');this.menu=new AnchoredMenu({origin,anchor:origin,label:this.m('menu'),className:'mt-tools-menu',items,onChoose:choose,onClose:()=>{origin.setAttribute('aria-expanded','false');this.menu=null}})}
 click(event){
  const el=event.target.closest('button');if(!el)return;
  if(el.hasAttribute('data-mts-retry')){void this.commit(true);return}
  if(el.hasAttribute('data-mts-reload')){this.draft=null;void this.load();return}
  if(this.busy||this.session.pending)return;
  if(el.hasAttribute('data-keto-program')){this.readInputs();this.menuFor(el,ketoProgramItems(this.language,this.draft.keto.program),id=>{setKetoProgram(this.draft,id);this.render()});return}
  if(el.hasAttribute('data-keto-details')){this.dialog(ketoMessage(this.language,'body'),ketoDetailsMarkup(this.calculation,this.language));return}
  if(el.hasAttribute('data-mts-dismiss')){this.tipHidden=true;try{localStorage.setItem('nourishing-macro-scheduler-tip','hidden')}catch{}this.render()}
  if(el.hasAttribute('data-mts-defaults'))this.onNavigate('macros');
  if(el.hasAttribute('data-mts-help'))this.dialog(this.m(el.dataset.mtsHelp==='enabled'?'enabled':'method'),`<p>${e(el.dataset.mtsHelp==='enabled'?this.m('enabledHelp'):this.t('settings'))}</p>`);
  if(el.hasAttribute('data-mts-add'))this.openEditor();
  if(el.hasAttribute('data-mts-template'))this.openEditor(el.dataset.mtsTemplate);
  if(el.hasAttribute('data-mts-weekday'))this.pickWeekday(Number(el.dataset.mtsWeekday));
  if(el.hasAttribute('data-mts-mode')){this.readInputs();this.draft.mode=el.dataset.mtsMode;this.render()}
  if(el.hasAttribute('data-mts-template-menu'))this.menuFor(el,[{id:'copy',label:this.m('copy')},{id:'delete',label:this.m('delete')}],id=>{
   if(id==='copy'){this.readInputs();this.draft.id=crypto.randomUUID();this.draft.editing=false;this.draft.name=this.t('copyName',{name:this.draft.name}).slice(0,120);this.render()}
   else this.confirm(this.m('delete'),this.m('deleteWarning'),()=>this.perform({kind:'template-delete',id:this.draft.id}));
  });
  if(el.hasAttribute('data-mts-schedule-menu'))this.menuFor(el,[{id:'reset',label:this.m('reset')}],()=>this.confirm(this.m('reset'),this.m('resetWarning'),()=>this.perform({kind:'reset',from:this.saved.today})));
 }
 openEditor(id){
  const template=this.saved.plan.templates.find(t=>t.id===id);this.draft=templateDraft(template,this.saved.defaults.settings);this.error='';this.render();window.scrollTo(0,0);
 }
 pickWeekday(day){
  const selected=this.saved.schedule.days[day],dialog=this.dialog(weekday(day,this.language),`<p class="mts-caption">${e(this.m('fromToday'))}</p>${[{id:null,name:this.m('defaults')},...this.saved.plan.templates].map(t=>this.button(`<span>${e(t.name)}</span><input type="radio" tabindex="-1" ${selected===t.id?'checked':''} aria-hidden="true">`,`class="mts-option" data-mts-choice="${e(t.id??'')}"`)).join('')}`);
  dialog.root.addEventListener('click',event=>{const el=event.target.closest('[data-mts-choice]');if(el){dialog.close();void this.perform({kind:'weekday',weekday:day,templateId:el.dataset.mtsChoice||null})}});
 }
 pickDay(){
  let handled=false;const dialog=this.dialog(this.m('day'),`<p class="mts-caption">${e(this.date)}</p>${[{id:'follow',name:this.m('follow')},{id:'default',name:this.m('defaults')},...this.saved.plan.templates.map(t=>({id:'template:'+t.id,name:t.name})),{id:'custom',name:this.m('customDay')}].map(t=>this.button(e(t.name),`class="mts-option" data-mts-day-choice="${e(t.id)}"`)).join('')}`,()=>{if(!handled&&this.startedFromDiary&&!this.disposed)this.onDiary()});
  dialog.root.addEventListener('click',event=>{const el=event.target.closest('[data-mts-day-choice]');if(!el)return;handled=true;dialog.close();const choice=el.dataset.mtsDayChoice;
   if(choice==='custom'){const selection=this.saved.plan.days.find(row=>row.date===this.date)?.selection,template=selection?.kind==='custom'?{id:crypto.randomUUID(),name:'',settings:selection.settings}:this.saved.plan.templates.find(t=>t.id===this.saved.assignment.templateId);this.draft=templateDraft(template,this.saved.defaults.settings);this.draft.day=true;this.render();window.scrollTo(0,0)}
   else this.confirm(this.m('day'),this.m('dayWarning'),()=>this.perform({kind:'day',date:this.date,selection:choice==='follow'?null:choice==='default'?{kind:'default'}:{kind:'template',id:choice.slice(9)}}),()=>this.pickDay());
  });
 }
 async saveEditor(){
  if(!this.draft||this.busy||this.session.pending)return;const form=this.root.querySelector('[data-mts-form]');if(!form.reportValidity())return;this.readInputs();let settings;try{settings=draftSettings(this.draft)}catch(error){this.error=error.message;this.render();return}
  const d=this.draft,change=d.day?{kind:'day',date:this.date,selection:{kind:'custom',settings}}:{kind:d.editing?'template-update':'template-create',template:{id:d.id,name:d.name.trim(),settings}};
  if(d.day||d.editing)this.confirm(this.m('save'),this.m(d.day?'dayWarning':'editWarning'),()=>this.perform(change));else await this.perform(change);
 }
 back(){if(this.menu){this.menu.close();return true}if(this.popup){this.popup.close();return true}if(this.draft){this.cancelCalculation();this.draft=null;this.error='';if(this.startedFromDiary)this.onDiary();else{this.render();window.scrollTo(0,0)}return true}return false}
 dispose(){this.disposed=true;this.cancelCalculation();this.readController?.abort();this.calcController?.abort();this.menu?.close(false);this.popup?.close(false);this.events.abort();if(this.session.listener===this.listener)this.session.listener=null;document.body.classList.remove('mts-editing')}
}
