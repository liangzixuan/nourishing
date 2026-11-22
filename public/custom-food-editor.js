import {previewFoodLabel} from './local-diary-projection.js';
import {previewLocalLibrary} from './library-local.js';
import {nutritionLabelPresentation} from './custom-food-source/nutrition-label-language.js';
import {nutrientDisplayName} from './report-source/public/nutrient-language.js';
import {uiLanguage,t} from './app-language.js';
import {fc,foodActionLabel} from './food-cloud-messages.js';
import {vitaminFormsMarkup,readVitaminForms,updateVitaminForms} from './custom-food-activity.js';
import {MobileLibrarySheet} from './foods-source/mobile-library.js';
import {LibraryEditorSave} from './library-editor-save.js';
import {escape as e} from './html.js';

import {FoodPortionsEditor} from './custom-food-source/food-portions.js';
import {FoodNutritionView} from './food-entry-source/food-nutrition-view.js';
import {quantityFields} from './quantity.js';
const initialLabelUnits=profile=>profile==='us-2016'?{vitaminD:'IU'}:{};
const profiles=()=>({'us-legacy':t("mobileFoodEditor.profile.us-legacy"),'us-2016':t("mobileFoodEditor.profile.us-2016"),'eu-1169':t("mobileFoodEditor.profile.eu-1169"),'anz-2026':t("mobileFoodEditor.profile.anz-2026"),'canada-2022':t("mobileFoodEditor.profile.canada-2022")});
const field=(label,name,value,extra='')=>`<label>${e(label)}<input name="${name}" aria-label="${e(label)}" value="${e(value??'')}" ${extra}></label>`;
const plainPortions=rows=>(rows??[]).map(({id,label,grams,milliliters})=>({id,label,...(grams===undefined?{milliliters}:{grams})}));
const basis=food=>({serving:food.serving,grams:food.grams??null,milliliters:food.milliliters??null,portions:plainPortions(food.portions)});
const quantity=(amount,unit)=>unit==='servings'?{amount:Number(amount)}:{quantity:Number(amount),unit:unit.startsWith('portion:')?'portion':unit,...(unit.startsWith('portion:')?{portionId:unit.slice(8)}:{})};
function measuredOptions(projection){
 const {grams,milliliters}=projection.resource;
 const measures=[[grams,'g'],[milliliters,'mL']].filter(([value])=>value!=null).map(([value,unit])=>value.toLocaleString(uiLanguage(),{maximumSignificantDigits:12})+' '+unit);
 return projection.labelView.options.map(([id,label])=>[id,id==='servings'&&measures.length?label+' — '+measures.join(' / '):label]);
}
function basisSummary(options,unit,amount){
 const label=options.find(([id])=>id===unit)?.[1]??unit;
 const count=Number(amount).toLocaleString(uiLanguage(),{maximumSignificantDigits:12});
 if(unit==='servings'||unit.startsWith('portion:'))return Number(amount)===1?label:`${count} × (${label})`;
 return `${count} ${label}`;
}
export function mountCustomFoodEditor({resource,data,draft,show,close,content,date,onSaved,onAction,openEntry,focusNutrition=false}){
 const initial=draft??{name:resource?.name??'',serving:resource?.serving??'',grams:resource?.grams??null,milliliters:resource?.milliliters??null,barcode:resource?.barcode??'',notes:resource?.notes??'',nutrients:{...resource?.nutrients},portions:plainPortions(resource?.portions),nutrientEdits:[]};
 const nameField=`<label class="mfe-name-row"><span>${e(t('mobileFoodEditor.foodName'))} <span class="mfe-required" aria-hidden="true">*</span></span><input name="name" value="${e(initial.name??'')}" required maxlength="500" placeholder="${e(t('mobileFoodEditor.foodExample'))}"></label>`;
 const helpButton=(topic,id,label)=>`<button type="button" class="mfe-context-help" data-mfe-help-for="${topic}" aria-label="${e(t(label))}" aria-expanded="false" aria-controls="${id}">?</button>`;
 const measurement=(name,unit,value,min)=>`<label class="mfe-measure"><span>${e(t('mobileFoodEditor.'+(name==='grams'?'servingWeight':'servingVolume')))}</span><span class="mfe-serving-value"><input name="${name}" aria-label="${e(fc(name==='grams'?'servingWeight':'servingVolume'))}" type="number" min="${min}" max="100000" step="any" placeholder="–" value="${e(value??'')}"><span>${unit}</span></span></label>`;
 const weight=measurement('grams','g',initial.grams,0.001),volume=measurement('milliliters','mL',initial.milliliters,0.000001);
 const volumeOnly=initial.milliliters!=null&&initial.grams==null;
 const servingMeasurements=volumeOnly?volume:weight+(initial.milliliters!=null?volume:'');
 const alternateMeasurement=volumeOnly?weight:initial.milliliters==null?volume:'';
 const servingInfo=`<div class="mfe-serving-tip">${helpButton('servings','mfe-serving-help','mobileFoodEditor.servingHelpTitle')}<span>${e(t('mobileFoodEditor.servingInstruction'))}</span></div><p id="mfe-serving-help" class="mfe-context-text" hidden>${e(t('mobileFoodEditor.servingHelp'))}</p>`;
 let edits=structuredClone(initial.nutrientEdits??[]),profile='us-2016',labelQuantity={amount:1},units=initialLabelUnits(profile),values={},projection,reference,stage='details',disposed=false,busy=false,saving=false,queue=Promise.resolve(),previewSerial=0,previewAbort,ready=false,actionChild,menu,saveAdd=false;
 show(`<section class="mobile-food-editor"><header class="sheet-header"><button type="button" class="icon-button" data-mfe-close aria-label="${e(t("common.close"))}">×</button><h2 id="sheet-title">${resource?t("mobileFoodEditor.edit"):t("mobileFoodEditor.title")}</h2><div class="mfe-header-actions"><button type="button" data-mfe-help aria-label="${e(t('mobileFoodEditor.help'))}">?</button>${resource?`<button type="button" data-mfe-menu aria-label="${e(t('mobileSuggest.options'))}">⋮</button>`:''}</div></header><p data-mfe-error role="alert"></p><button type="button" data-mfe-retry hidden>${e(t("mobileSuggest.retry"))}</button><form data-form="food" novalidate><section class="mfe-details"><section class="mfe-food-info"><h3>${e(t("mobileFoodEditor.details"))}</h3>${nameField}</section><details class="mfe-card mfe-servings" open><summary>${e(t("mobileCompositeEditor.servingSizes"))}</summary>${servingInfo}<div class="mfe-base-serving">${field(t("mobileCompositeEditor.servingName"),'serving',initial.serving,`maxlength="100" placeholder="${e(t('mobileFoodEditor.servingExample'))}"`)}${servingMeasurements}</div><div data-food-portions></div></details><details class="mfe-card mfe-nutrition" data-food-nutrition open><summary>${e(t("mobileFoodEditor.nutrition"))}</summary><div class="mfl"><div class="mfl-options"><div data-mfl-basis></div><div class="mfl-profile"><span>${e(t("mobileFoodEditor.labelType"))} ${helpButton('profile','mfe-profile-help','mobileFoodEditor.labelHelp')}</span><select data-profile aria-label="${e(t("mobileFoodEditor.labelType"))}">${Object.entries(profiles()).map(([id,label])=>`<option value="${id}" ${id===profile?'selected':''}>${e(label)}</option>`).join('')}</select></div><p id="mfe-profile-help" class="mfe-context-text" hidden>${e(t('mobileFoodEditor.profileHelp'))} <span data-label-help></span></p></div></div></details><details class="mfe-card" data-mfe-facts open><summary>${e(t("mobileFoodEditor.facts"))}</summary><div class="mfl"><div data-label-rows><p>${e(t("mobileFoodEditor.loading"))}</p></div><details class="mfe-card mfl-other"><summary>${e(t("mobileFoodEditor.otherNutrients"))}</summary><div class="nutrient-editor">${data.nutrients.map(row=>`<label data-manual-row="${e(row.id)}">${e(nutrientDisplayName(row,uiLanguage())+' ('+row.unit+')')}<input data-manual="${e(row.id)}" aria-label="${e(nutrientDisplayName(row,uiLanguage())+' ('+row.unit+')')}" type="number" min="0" step="any" value="${e(initial.nutrients?.[row.id]??'')}"></label>`).join('')}</div></details></div></details><details class="mfe-card" data-mfe-advanced><summary>${e(t("mobileFoodEditor.advanced"))}</summary><div class="mfe-base-serving">${alternateMeasurement}</div>${field(t("nutritionLabelErrors.field.barcode"),'barcode',initial.barcode,'maxlength="100"')}<label>${e(t("mobileCompositeEditor.notes"))}<textarea name="notes" maxlength="4000">${e(initial.notes)}</textarea></label>${resource?`<div class="mfe-actions">${['share','print',resource.retired?'restore':'retire','log'].map(label=>`<button type="button" data-food-action="${e(label)}" data-library-${(label==='restore'?'retire':label)}>${e(foodActionLabel(label))}</button>`).join('')}</div>`:''}</details><details class="mfe-card" data-mfe-help-section><summary>${e(t("mobileFoodEditor.help"))}</summary><p>${e(resource?.source?.name??resource?.source??t("libraryView.customFood"))}</p>${resource?.dataQuality?`<p>${e(resource.dataQuality)}</p>`:''}</details></section><section class="mfe-review" hidden><h2>${e(t("mobileFoodEditor.review"))}</h2><p data-review-title></p><div data-review-quantity></div><div data-review-nutrition></div></section><footer class="mfe-footer"><button type="button" data-mfe-back hidden>${e(t("mobileFoodEditor.back"))}</button><button type="submit" data-mfe-submit>${e(t("mobileFoodEditor.next"))}</button><button type="submit" data-mfe-add hidden>${e(t("mobileCompositeEditor.saveAdd"))}</button></footer></form></section>`);
 const root=content.querySelector('.mobile-food-editor'),form=root.querySelector('form'),dialog=content.closest('dialog'),events=new AbortController(),signal=events.signal,error=root.querySelector('[data-mfe-error]'),submit=form.querySelector('[data-mfe-submit]');
 const portions=new FoodPortionsEditor({root:form.querySelector('[data-food-portions]'),portions:initial.portions,gramsInput:form.elements.grams,volumeInput:form.elements.milliliters,language:uiLanguage(),presentation:'mobile',removeIcon:'×'});
 const nutrition=new FoodNutritionView({target:form.querySelector('[data-review-nutrition]'),language:uiLanguage(),unit:data.energyUnit??'kcal',catalog:data.nutrients}),sections=new Map();
 const alive=()=>!disposed&&root.isConnected;
 const saver=new LibraryEditorSave({kind:'food',revision:data.revision,host:()=>root.querySelector('.mfe-review'),onChange:()=>{if(alive())controls();}});
 function read(){return {...(resource?{id:resource.id}:{}),name:form.elements.name.value,serving:form.elements.serving.value,grams:form.elements.grams.value===''?null:Number(form.elements.grams.value),milliliters:form.elements.milliliters.value===''?null:Number(form.elements.milliliters.value),barcode:form.elements.barcode.value,...(!resource||Object.hasOwn(resource,'notes')||form.elements.notes.value!==''?{notes:form.elements.notes.value}:{}),nutrients:initial.nutrients,portions:portions.read(),nutrientEdits:structuredClone(edits)};}
 function controls(){root.querySelectorAll('.mfe-details input,.mfe-details select,.mfe-details textarea,.mfe-details button,[data-review-quantity] input,[data-review-quantity] select').forEach(node=>node.disabled=busy||saver.locked);root.querySelectorAll('.mfl input,.mfl select,[data-food-action]').forEach(node=>node.disabled=busy||saver.locked);for(const row of projection?.labelView?.rows??[]){const input=root.querySelector(`[data-label-row="${row.id}"] [data-value=percent]`);if(input)input.disabled=busy||saver.locked||!row.percentAllowed;}submit.disabled=busy||(stage==='review'&&!ready&&!saver.locked);const add=form.querySelector('[data-mfe-add]');if(!busy&&!saver.locked)portions.sync();add.hidden=stage!=='review';add.disabled=submit.disabled;
 root.querySelector('.mfe-header-actions').hidden=stage==='review';submit.textContent=stage==='review'?t("mobileFoodEditor.save"):t("mobileFoodEditor.next");root.querySelector('[data-mfe-close]').disabled=saving;root.querySelector('[data-mfe-back]').disabled=busy||saver.locked;}
 function project(nextEdits=edits){
  const raw=read(),draft={...raw,name:raw.name.trim()||'Food draft',nutrientEdits:nextEdits};
  projection=previewFoodLabel(resource,draft,{profile,quantity:labelQuantity,units});
  edits=nextEdits;reference=basis(projection.resource);
 }
 let renderedFormat;
 function renderLabel(){if(!projection)return;const presentation=nutritionLabelPresentation(uiLanguage()),view=projection.labelView,openForms=new Set([...root.querySelectorAll('[data-activity][open]')].map(node=>node.dataset.activity));root.querySelector('[data-profile]').value=profile;const selected=labelQuantity.quantity===undefined?'servings':labelQuantity.unit==='portion'?'portion:'+labelQuantity.portionId:labelQuantity.unit;
  const basisHost=root.querySelector('[data-mfl-basis]'),options=measuredOptions(projection),amount=labelQuantity.quantity??labelQuantity.amount;
  if(!basisHost.firstElementChild){
   basisHost.innerHTML=`<details class="mfe-basis"><summary><span>${e(t('mobileFoodEditor.per'))}</span><span data-basis-summary></span></summary>
    <div data-label-basis><input data-label-amount type="number" min="0.000001" step="any" aria-label="${e(fc('labelAmount'))}"><select data-label-unit aria-label="${e(t('nutritionLabelErrors.field.serving'))}"></select></div></details>`;
  }
  basisHost.querySelector('[data-basis-summary]').textContent=basisSummary(options,selected,amount);
  basisHost.querySelector('input').value=amount;
  const basisUnit=basisHost.querySelector('select');
  basisUnit.innerHTML=options.map(([id,label])=>`<option value="${e(id)}">${e(label)}</option>`).join('');
  basisUnit.value=selected;
  const labelRows=root.querySelector('[data-label-rows]'),format=JSON.stringify([profile,units]);
  if(format===renderedFormat){
   for(const row of view.rows){
    const node=labelRows.querySelector(`[data-label-row="${row.id}"]`);
    const amount=node.querySelector('[data-value=amount]'),percent=node.querySelector('[data-value=percent]');
    if(amount)amount.value=row.amount;
    if(percent)percent.value=row.percent===''?'':Number(Number(row.percent).toPrecision(6));
    updateVitaminForms(node,row);
   }
  }else{
   labelRows.dataset.profileId=profile;
  labelRows.innerHTML=view.rows.map(source=>{const row={...source,name:presentation.rowName({id:profile},source)},fullName=presentation.fullRowName({id:profile},source),description=fullName===row.name?'':` aria-description="${e(fullName)}"`;const unitChoices=row.id==='vitaminD'?['µg','IU']:row.energyUnits?['kcal','kJ']:null;const cell=(key,value,suffix)=>`<label class="mfl-cell"><input data-value="${key}" inputmode="decimal" value="${e(value)}" aria-label="${e(row.name+' '+(key==='percent'?'%':row.unit))}"${description} placeholder="${key==='percent'?'DV':'–'}"><span>${e(suffix)}</span></label>`;return `<div class="mfl-row" data-label-row="${e(row.id)}"><span class="mfl-name"${fullName===row.name?'':` title="${e(fullName)}"`}>${e(row.name)}</span><div class="mfl-amount">${row.amountAllowed?cell('amount',row.amount,unitChoices?'':row.unit):''}${unitChoices?`<select data-label-nutrient-unit aria-label="${e(row.name+' '+t('quantity.unit'))}">${unitChoices.map(unit=>`<option ${unit===row.unit?'selected':''}>${e(unit)}</option>`).join('')}</select>`:''}</div>${row.dailyValue!==null?cell('percent',row.percent===''?'':Number(Number(row.percent).toPrecision(6)),'%'):'<span></span>'}${vitaminFormsMarkup(row,openForms.has(row.id))}</div>`;}).join('');
   renderedFormat=format;
  }
  const covered=new Set(view.rows.flatMap(row=>[row.nutrientId??row.id,row.dailyValue!==null?row.percentId:null]).filter(Boolean));root.querySelectorAll('[data-manual]').forEach(input=>{input.closest('label').hidden=covered.has(input.dataset.manual);input.value=projection.resource.nutrients[input.dataset.manual]??'';});root.querySelector('[data-label-help]').textContent=presentation.population({id:profile});controls();
 }
 function flush(){if(!Object.keys(values).length)return false;const authored=structuredClone(values);project([...edits,{kind:'label',profile,quantity:structuredClone(labelQuantity),values:authored,basis:reference}]);values={};return true;}
 function refreshLabel(action){
  try{error.textContent='';action();renderLabel();root.querySelector('[data-mfe-retry]').hidden=true;}
  catch(failure){error.textContent=failure.message;root.querySelector('[data-profile]').value=profile;root.querySelector('[data-mfe-retry]').hidden=false;}
 }
 function enqueue(action){queue=queue.then(async()=>{if(!alive())return;busy=true;error.textContent='';controls();try{await action();if(alive())renderLabel();}catch(failure){if(alive()){error.textContent=failure.message;root.querySelector('[data-profile]').value=profile;root.querySelector('[data-mfe-retry]').hidden=false;}}finally{busy=false;if(alive())controls();}});return queue;}
 function authorLabel(input){const node=input.closest('[data-label-row]'),id=node.dataset.labelRow,row=projection.labelView.rows.find(row=>row.id===id),value=values[id]??{};
  if(input.matches('[data-value]')){value[input.dataset.value]=input.value;if(row.percentId===(row.nutrientId??row.id))delete value[input.dataset.value==='amount'?'percent':'amount'];}
  else value.amount=node.querySelector('[data-value=amount]').value;
  value.unit=row.unit;const forms=readVitaminForms(node);if(forms===undefined)delete value.forms;else value.forms=forms;values[id]=value;
 }
 root.addEventListener('input',event=>{if(event.target.matches('[data-value],[data-activity-share]'))authorLabel(event.target);},{signal});
 form.addEventListener('input',event=>{if(!event.target.closest('[data-library-edit-review]'))saver.clearReview();},{signal});
 form.addEventListener('change',event=>{const input=event.target;if(input.matches('[name=name],[name=barcode],[name=notes]'))return;if(input.closest('.mfe-review')){const block=form.querySelector('[data-review-quantity]');block.querySelector('[data-review-basis-name]').textContent=basisSummary(measuredOptions(projection),block.querySelector('select').value,block.querySelector('input').value);void preview();return;}const value=input.value,id=input.closest('[data-label-row]')?.dataset.labelRow;if(input.matches('[data-activity-form]')){input.closest('[data-activity]').querySelector('[data-activity-shares]').hidden=input.value!=='mixed';authorLabel(input);if(input.value==='mixed')return;}
  refreshLabel(()=>{const committed=flush();if(input.matches('[data-value],[data-activity-form],[data-activity-share]')&&committed)return;if(input.matches('[data-profile]')){profile=value;units=initialLabelUnits(profile);}else if(input.matches('[data-label-nutrient-unit]'))units[id]=value;else if(input.matches('[data-label-amount],[data-label-unit]'))labelQuantity=quantity(root.querySelector('[data-label-amount]').value,root.querySelector('[data-label-unit]').value);else if(input.matches('[data-manual]')){if(!input.checkValidity())throw Error(fc("nonnegativeNutrient"));project([...edits,{kind:'manual',values:{[input.dataset.manual]:value===''?null:Number(value)}}]);return;}project();});
 },{signal});
 async function preview(){previewAbort?.abort();previewAbort=new AbortController();const serial=++previewSerial;ready=false;submit.disabled=true;try{const result=await previewLocalLibrary({kind:'food',draft:read(),date:date(),quantity:quantity(form.querySelector('[data-review-quantity] input').value,form.querySelector('[data-review-quantity] select').value)},previewAbort.signal);if(!alive()||serial!==previewSerial||stage!=='review')return;await nutrition.render(result.nutrition,{open:sections,isCurrent:()=>alive()&&serial===previewSerial&&stage==='review',showHighlights:true});ready=true;error.textContent='';root.querySelector('[data-mfe-retry]').hidden=true;}catch(failure){if(alive()&&serial===previewSerial){error.textContent=failure.message;root.querySelector('[data-mfe-retry]').hidden=false;}}finally{if(alive()&&serial===previewSerial)controls();}}
 async function review(){flush();project();if(!alive())return;renderLabel();stage='review';root.querySelector('.mfe-details').hidden=true;root.querySelector('.mfe-review').hidden=false;root.querySelector('[data-review-title]').textContent=read().name;const options=measuredOptions(projection);root.querySelector('[data-review-quantity]').innerHTML=`<details class="mfe-basis"><summary><span>${e(t("mobileFoodEditor.per"))}</span><span data-review-basis-name>${e(basisSummary(options,'servings',1))}</span></summary><div class="quantity-fields">${quantityFields(options)}</div></details>`;root.querySelector('[data-mfe-back]').hidden=false;(dialog??content).scrollTop=0;await preview();}
 function back(){if(menu){menu.close();return;}if(actionChild?.back())return;saver.clearReview();if(stage==='details')return exit();if(saving||saver.locked)return;++previewSerial;previewAbort?.abort();nutrition.clear();stage='details';root.querySelector('.mfe-details').hidden=false;root.querySelector('.mfe-review').hidden=true;root.querySelector('[data-review-quantity]').replaceChildren();root.querySelector('h2').textContent=resource?t("mobileFoodEditor.edit"):t("mobileFoodEditor.title");root.querySelector('[data-mfe-back]').hidden=true;root.querySelector('[data-mfe-retry]').hidden=true;controls();}
 function dispose(){if(disposed)return;disposed=true;menu?.close(false);actionChild?.dispose();saver.dispose();events.abort();previewAbort?.abort();portions.dispose();nutrition.dispose();observer.disconnect();}
 function exit(){if(saving)return;dispose();close();}
 async function save(add){if(!ready&&!saver.locked)return;if(!saver.locked)saveAdd=add;busy=true;saving=true;controls();error.textContent='';try{const result=await saver.save(read());if(!result||!alive())return;dispose();close();await onSaved?.();if(saveAdd)openEntry('food',result.item.id);}catch(failure){if(!alive())return;error.textContent=failure.message;}finally{busy=false;saving=false;if(alive())controls();}}

 form.addEventListener('submit',event=>{event.preventDefault();if(busy)return;if(stage==='review'){void save(event.submitter?.hasAttribute('data-mfe-add'));return;}if(form.reportValidity())void enqueue(review);},{signal});
 root.querySelector('[data-mfe-back]').onclick=back;root.querySelector('[data-mfe-close]').onclick=exit;root.querySelector('[data-mfe-retry]').onclick=()=>stage==='review'?preview():refreshLabel(()=>{flush();project();});
 root.addEventListener('click',event=>{
  const button=event.target.closest('[data-mfe-help-for]');if(!button)return;
  const text=root.querySelector('#'+button.getAttribute('aria-controls'));
  text.hidden=!text.hidden;button.setAttribute('aria-expanded',String(!text.hidden));
 },{signal});
 root.querySelector('[data-mfe-help]').onclick=()=>{const section=root.querySelector('[data-mfe-help-section]');section.open=true;section.scrollIntoView({block:'center'});section.querySelector('summary').focus({preventScroll:true});};
 const menuButton=root.querySelector('[data-mfe-menu]');
 if(menuButton)menuButton.onclick=()=>{menu=new MobileLibrarySheet({label:resource.name,items:[{id:'delete',label:foodActionLabel('delete'),icon:'<img src="/repeat-source/delete.svg" alt="">'}],onClose:()=>{menu=null;},onChoose:()=>onAction?.('delete')});menu.root.classList.add('ml-action-rows');};
 root.querySelectorAll('[data-food-action]').forEach(button=>button.onclick=()=>{void enqueue(async()=>{flush();const snapshot=read(),action=button.dataset.foodAction;if(['retire','restore'].includes(action)){actionChild?.dispose();actionChild=onAction?.(action,snapshot);return;}dispose();onAction?.(action,snapshot);});});
 form.addEventListener('invalid',event=>{for(let node=event.target.parentElement;node&&node!==form;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;},{capture:true,signal});
 root.addEventListener('toggle',event=>{if(event.target.dataset.mfSection)sections.set(event.target.dataset.mfSection,event.target.open);},{capture:true,signal});
 const cancel=event=>{if(!alive())return;event.preventDefault();event.stopImmediatePropagation();back();};dialog?.addEventListener('cancel',cancel,{capture:true,signal});window.addEventListener('nourishing-back',cancel,{capture:true,signal});
 // Android resizes the editor when its keyboard opens. Keep the editing area free
 // of the fixed footer until the viewport recovers, even if the input keeps focus.
 const viewport=window.visualViewport,footer=form.querySelector('.mfe-footer');
 if(viewport&&matchMedia('(pointer: coarse)').matches){
  let fullHeight=viewport.height,width=viewport.width;
  const updateFooter=()=>{
   if(viewport.scale!==1)return;
   const editing=form.contains(document.activeElement)&&document.activeElement.matches('input:not([type=checkbox]),textarea');
   if(width!==viewport.width||!editing){
    width=viewport.width;fullHeight=viewport.height;footer.hidden=false;return;
   }
   fullHeight=Math.max(fullHeight,viewport.height);
   if(viewport.height>=fullHeight)footer.hidden=false;
   else if(!footer.hidden&&fullHeight-viewport.height>=footer.offsetHeight)footer.hidden=true;
  };
  viewport.addEventListener('resize',updateFooter,{signal});
  form.addEventListener('focusin',updateFooter,{signal});
 }
 const observer=new MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(content,{childList:true});
 refreshLabel(project);
 if(focusNutrition){const section=root.querySelector('[data-food-nutrition]');section.open=true;section.scrollIntoView({block:'start'});}
 else if(!resource&&!draft)form.elements.name.focus({preventScroll:true});
 return {dispose,snapshot:read};
}
