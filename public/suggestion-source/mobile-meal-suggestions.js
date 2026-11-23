import {localSuggestedMeal,localSuggestedIngredient} from './local-suggestion-preview.js';
import {MobileIngredientDetail} from './mobile-ingredient-detail.js';
import {MealSuggestionDraft} from './meal-suggestion-draft.js';
import {MobileFoodSearch} from '../food-search-source/mobile-food-search.js';
import {applyCarouselStyles} from './ui.js';
import {mealCarousel} from './mobile-meal-carousel.js';
import {diarySymbol} from './ui.js';
import {escape as e,symbol} from './ui.js';
import {formatMessage} from '../report-source/public/message-format.js';
import {mealReferenceKey} from './meal-suggestion-policy.mjs';
import {mealMacroAmounts,mealSuggestionGuidanceText} from './meal-suggestion-presentation.js';
import {renderSourceAttributions} from './source-attribution.js';

const macroLabel={protein:'targetSetup.macro.protein',carbs:'mobileFoodEditor.facts.carbs',fat:'mobileFoodEditor.facts.fat'};
const filterOrder={categories:['breakfast','lunch','dinner','snack','dessert'],exclusions:['milk','egg','fish','peanut','soy','shellfish','tree-nut']};
function filterChoices(field,available){
 const order=filterOrder[field];
 if(!order)return available;
 return [...order.filter(value=>available.includes(value)),...available.filter(value=>!order.includes(value))];
}

// Presentation only: MealSuggestionsPanel owns requests, filters and preference outcomes.
export class MobileMealSuggestionsView {
 constructor(panel,{header,onBack,icon,nutrients,initialGroup,groups=[]}){Object.assign(this,{panel,header,onBack,icon,nutrients});this.m=key=>formatMessage(panel.language,'mobileSuggest.'+key);this.groups=groups;this.group=groups.includes(initialGroup)?initialGroup:groups.includes('Uncategorized')?'Uncategorized':groups[0];this.time='';this.screen='filters';this.drafts=[];this.pages=[];this.selection=0;}
 button(label,action,attributes=''){return `<button type="button" data-meal-action="${action}" ${attributes}>${e(label)}</button>`}
 optionsButton(){return `<button type="button" data-ms-options aria-label="${e(this.m('options'))}">${diarySymbol('more_vert')}</button>`;}
 heading(){
  const results=this.screen==='results';
  this.header.innerHTML=`<header class="ms-header"><button type="button" data-ms-back aria-label="${e(this.m(results?'back':'close'))}">${this.icon(results?'back':'close')}</button><h1>${e(this.m(results?'results':'title'))}</h1>${results?this.optionsButton():'<span></span>'}</header>`;
  this.header.querySelector('[data-ms-back]').onclick=()=>{if(!this.back())this.onBack()};
  const optionsButton=(results?this.header:this.root).querySelector('[data-ms-options]');
  optionsButton.onclick=()=>{(results?this.options:this.filterOptions).showModal();this.error(this.panel.lastError||'')};
 }
 render(){const p=this.panel,m=p.m;this.root=p.root;this.root.innerHTML=`<div class="ms-home"><div class="ms-notices"><p data-meal-error role="alert" hidden></p><p data-meal-status role="status"></p></div><div data-ms-filter-screen><div class="ms-filter-title"><h2>${e(this.m('select'))}</h2>${this.optionsButton()}</div><p class="ms-filter-intro">${e(this.m('selectedDayIntro'))}</p><div data-meal-filters></div><footer class="ms-footer">${this.button(m('get'),'get')}</footer></div><div data-ms-result-screen hidden><div data-meal-results></div><div class="ms-undo" hidden><span role="status"></span><button type="button" data-ms-undo>${e(this.m('undo'))}</button><button type="button" data-ms-dismiss aria-label="${e(this.m('close'))}">${this.icon('close')}</button></div></div><dialog class="ms-filter-options" aria-label="${e(this.m('options'))}"><button type="button" data-meal-action="reset"><img src="/diary-action-icons/repeat.svg" alt=""><span>${e(m('reset'))}</span></button></dialog><dialog class="ms-options"><section><header><h2>${e(this.m('options'))}</h2><button type="button" data-ms-close aria-label="${e(this.m('close'))}">${this.icon('close')}</button></header><p class="ms-date">${e(m('forDate',{date:p.date}))}</p><div class="ms-diary-controls"><label class="field-row"><span>${e(formatMessage(p.language,'mobileRepeat.group'))}</span><select data-ms-group aria-label="${e(formatMessage(p.language,'mobileRepeat.group'))}">${this.groups.map(group=>`<option ${group===this.group?'selected':''}>${e(group)}</option>`).join('')}</select></label><label class="field-row"><span>${e(formatMessage(p.language,'appActions.time'))}</span><input type="time" data-ms-time aria-label="${e(formatMessage(p.language,'appActions.time'))}" value="${e(this.time)}"></label></div><p data-ms-options-error role="alert" hidden></p><div data-ms-meal-options></div><div class="ms-option-actions">${this.button(m('reset'),'reset')}${this.button(m('resetResults'),'reset-results')}${this.button(m('reload'),'refresh-preferences')}</div><label class="ms-unknown"><input type="checkbox" id="meal-unknown">${e(m('includeUnknown'))}</label><p>${e(m('unknownHelp'))}</p><details class="meal-tag-editor"><summary>${e(m('reviewTags'))}</summary><div data-meal-tags></div></details><div data-meal-excluded></div><details><summary>${e(m('method'))}</summary><p>${e(m('intro'))}</p><p>${e(m('ranking'))}</p><div data-ms-method></div></details></section></dialog></div>`;
 this.filterOptions=this.root.querySelector('.ms-filter-options');
 this.filterOptions.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();this.filterOptions.close()});
 this.filterOptions.addEventListener('click',event=>{if(event.target===this.filterOptions)this.filterOptions.close()});
 this.mealOptions=this.root.querySelector('[data-ms-meal-options]');
 this.options=this.root.querySelector('.ms-options');this.options.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();this.options.close()});this.options.addEventListener('click',event=>{if(event.target===this.options)this.options.close()});this.options.addEventListener('close',()=>this.error(this.panel.lastError||''));this.root.querySelector('[data-ms-close]').onclick=()=>this.options.close();this.undoBar=this.root.querySelector('.ms-undo');
 this.undoBar.querySelector('[data-ms-undo]').onclick=()=>{const draft=this.removedDraft;this.dismissUndo();void draft?.undoRemove();};
 this.undoBar.querySelector('[data-ms-dismiss]').onclick=()=>this.dismissUndo();
 this.root.querySelector('[data-ms-group]').onchange=event=>{this.group=event.target.value;};this.root.querySelector('[data-ms-time]').onchange=event=>{this.time=event.target.value;};
 this.heading();this.renderFilters();}
 renderFilters(){const p=this.panel,o=p.options,f=p.host.filters,target=this.root.querySelector('[data-meal-filters]');if(!o){target.innerHTML=`<p role="status">${e(p.m('loadingFilters'))}</p>`;return;}target.innerHTML=`<div class="ms-filter-card">${['diets','categories','exclusions'].map(field=>`<fieldset class="ms-chip-group ms-${field}"><legend>${e(this.m(field))}${f[field].length?'':` (${e(this.m(field==='exclusions'?'none':'all'))})`}</legend><div>${filterChoices(field,o[field]).map(value=>`<label class="ms-chip"><input type="checkbox" data-meal-filter="${field}" value="${e(value)}" ${f[field].includes(value)?'checked':''}><span>${e(p.m('choice.'+value))}</span></label>`).join('')}</div></fieldset>`).join('')}<label class="ms-custom"><strong>${e(this.m('includeCustom'))}</strong><input type="checkbox" role="switch" id="meal-custom" ${f.includeCustom?'checked':''}></label></div>`;this.root.querySelector('#meal-unknown').checked=f.includeUnknownTags;}
 showResults(){this.clearDrafts();this.screen='results';this.options.close();this.root.querySelector('[data-ms-filter-screen]').hidden=true;this.root.querySelector('[data-ms-result-screen]').hidden=false;this.heading();window.scrollTo(0,0);}
 back(){if(this.filterOptions.open){this.filterOptions.close();return true;}if(this.quantityDialog){this.closeQuantity();return true;}if(this.picker){if(this.search.open)this.search.closeOptions();else this.closeSearch();return true;}if(this.options.open){this.options.close();this.error(this.panel.lastError||'');return true}if(this.screen!=='results')return false;this.panel.invalidate('');this.panel.error('');this.screen='filters';this.root.querySelector('[data-ms-filter-screen]').hidden=false;this.root.querySelector('[data-ms-result-screen]').hidden=true;this.heading();return true;}
 resetFilters(){this.filterOptions.close();this.options.close();if(this.screen==='results')this.back();this.panel.error('');}
 filterSummary(){const p=this.panel,f=p.host.filters;for(const field of ['diets','categories','exclusions']){const legend=this.root.querySelector('.ms-'+field+' legend');if(legend)legend.textContent=this.m(field)+(f[field].length?'':' ('+this.m(field==='exclusions'?'none':'all')+')');}}
 error(message){if(this.panel.disposed)return;const main=this.root.querySelector('[data-meal-error]'),options=this.root.querySelector('[data-ms-options-error]');for(const node of [main,options]){node.textContent=message;node.hidden=!message||(node===main?this.options.open:!this.options.open);}}
 loadFailed(){this.root.querySelector('[data-meal-results]').innerHTML=this.button(this.m('retry'),'get','class="ms-primary"');}
 controls(){const p=this.panel;for(const node of this.root.querySelectorAll('[data-meal-action=get]'))node.disabled=!p.options||p.preferencesBlocked();}
 dismissUndo(){this.removedDraft=null;if(this.undoBar)this.undoBar.hidden=true;}
 removeIngredient(draft,index){
  void draft.remove(index);
  this.removedDraft=draft;
  this.undoBar.querySelector('[role=status]').textContent=this.m('itemDeleted');
  this.undoBar.hidden=false;
 }
 clearDrafts(){this.mealOptions.replaceChildren();this.dismissUndo();this.closeQuantity();for(const draft of this.drafts)draft.dispose();this.drafts=[];this.pages=[];this.closeSearch();}
 reviewedItem(index){return this.drafts[index]?.reviewedMeal();}
 macros(nutrition){
  const {language,energyUnit,m}=this.panel;
  const number=new Intl.NumberFormat(language,{maximumFractionDigits:0});
  return mealMacroAmounts(nutrition,energyUnit).map(({id,value,unit})=>{
   const amount=Number.isFinite(value)?number.format(value):m('unknown');
   return amount+' '+unit+(id==='energy'?'':' '+formatMessage(language,macroLabel[id]));
  }).join(', ');
 }
 renderMealOptions(items){
  const p=this.panel;
  if(!items.length)return;
  const meals=items.map((item,index)=>`<details class="ms-meal-options" data-ms-option-meal="${e(mealReferenceKey(item.ref))}">
   <summary>${e(item.name)}</summary>
   ${renderSourceAttributions(item.attributions)}
   <p>${e(p.m(item.ranking.personalized?'personalized':'notPersonalized'))}</p>
   <p>${e(p.m('missingNutrition'))}</p>
   <div>
    ${this.button(p.m('remove'),'remove',`data-index="${index}"`)}
    ${this.button(p.m('exclude'),'exclude',`data-index="${index}"`)}
    ${this.button(p.m(item.lessOften?'undoLess':'less'),'less',`data-index="${index}"`)}
   </div>
  </details>`);
  this.mealOptions.innerHTML=`<h3>${e(this.m('mealOptions'))}</h3>${meals.join('')}`;
 }
 renderResults(){const p=this.panel,r=p.result;if(!r)return;this.clearDrafts();this.root.querySelector('[data-meal-status]').textContent='';
 this.root.querySelector('[data-meal-results]').innerHTML=`<div class="ms-results">${r.items.map((item,index)=>`<details class="ms-result" data-ms-result="${index}" data-meal-id="${e(mealReferenceKey(item.ref))}" ${index===0?'open':''}><summary><span><strong>${e(item.name)}</strong><span class="ms-macros">${e(this.macros(item.nutrition))}</span></span>${symbol('expand_more')}</summary><div class="ms-result-body"><details class="ms-ingredients"><summary>${e(this.m('items'))}${symbol('expand_more')}</summary><ul></ul><button type="button" data-ms-add><span aria-hidden="true">+ </span>${e(this.m('addItem'))}</button></details><div data-ms-impact></div>${this.button(formatMessage(p.language,'libraryView.addToDiary'),'review',`data-index="${index}" class="ms-primary" disabled`)}</div></details>`).join('')}${r.items.length?this.button(this.m('generate'),'next','class="ms-generate"'):`<p class="ms-empty">${e(p.m('noResults'))}</p>`}</div>`;
 this.renderMealOptions(r.items);
 this.drafts=r.items.map((item,index)=>new MealSuggestionDraft({item,date:p.date,request:p.request,localPreview:localSuggestedMeal,onChange:()=>this.updateDraft(index)}));
 for(const [index,draft]of this.drafts.entries()){this.pages[index]=0;this.updateDraft(index);const card=this.card(index);card.addEventListener('toggle',()=>{if(card.open&&draft.status==='idle')void draft.refresh()});card.addEventListener('click',event=>{const edit=event.target.closest('[data-ms-edit]'),remove=event.target.closest('[data-ms-remove]'),page=event.target.closest('[data-ms-page]');if(edit)this.openQuantity(index,Number(edit.dataset.msEdit));else if(remove)this.removeIngredient(draft,Number(remove.dataset.msRemove));else if(page){this.pages[index]=Number(page.dataset.msPage);this.updateImpact(index)}else if(event.target.closest('[data-ms-add]'))this.openSearch(index);else if(event.target.closest('[data-ms-preview-retry]'))void draft.refresh();});}
 if(this.drafts[0])void this.drafts[0].refresh();this.root.querySelector('[data-ms-method]').innerHTML=r.limitations.map(line=>`<p>${e(mealSuggestionGuidanceText(line,p.language))}</p>`).join('');p.controls();}
 saving(value){this.saveBusy=value;for(const node of this.root.querySelectorAll('[data-meal-action=review],[data-ms-group],[data-ms-time]'))node.disabled=value;if(!value)this.drafts.forEach((_,index)=>this.updateDraft(index));}
 card(index){return this.root.querySelector(`[data-ms-result="${index}"]`);}
 updateDraft(index){const draft=this.drafts[index],card=this.card(index);if(!draft||!card||this.panel.disposed)return;const p=this.panel;
 card.querySelector('.ms-ingredients ul').innerHTML=draft.rows.map((row,i)=>`<li><div class="ms-ingredient"><span class="ms-ingredient-name">${e(row.name)}</span><button type="button" class="ms-edit-ingredient" data-ms-edit="${i}" ${draft.ready?'':'disabled'} aria-label="${e(this.m('editQuantity'))}: ${e(row.name)}">${e(p.ingredientQuantity(row))}${row.unit!=='g'&&Number.isFinite(row.grams)?' · '+e(p.format(row.grams))+' g':''}</button></div>${row.source?`<small>${e(typeof row.source==='string'?row.source:row.source.name||row.source.dataset||'')}</small>`:''}<button type="button" data-ms-remove="${i}" aria-label="${e(this.m('removeItem'))}: ${e(row.name)}">${this.icon('close')}</button></li>`).join('');
 card.querySelector('[data-meal-action=review]').disabled=this.saveBusy||!draft.ready;card.querySelector('.ms-macros').textContent=draft.ready?this.macros(draft.preview.meal):(draft.status==='idle'?this.macros(draft.item.nutrition):'—');this.updateImpact(index);}
 updateImpact(index){const draft=this.drafts[index],card=this.card(index);if(!draft||!card)return;const target=card.querySelector('[data-ms-impact]');target.innerHTML=draft.ready?mealCarousel(draft.preview,{page:this.pages[index],nutrients:this.nutrients,language:this.panel.language,energyUnit:this.panel.energyUnit}):draft.status==='empty'?`<p role="status">${e(this.m('emptyMeal'))}</p>`:draft.status==='error'?`<p role="alert">${e(draft.error)}</p><button type="button" data-ms-preview-retry>${e(this.m('retry'))}</button>`:`<p role="status">${e(this.m('previewing'))}</p>`;applyCarouselStyles(target);}
 openQuantity(index,rowIndex){
  this.closeQuantity();const draft=this.drafts[index],row=draft?.rows[rowIndex];if(!draft?.ready||!row)return;
  const version=draft.version;
  const source=row.unit==='servings'?{amount:row.quantity}:{quantity:row.quantity,unit:row.unit,...(row.unit==='portion'?{portionId:row.portionId}:{})};
  const resource={name:row.name,serving:row.serving,grams:row.servingGrams,milliliters:row.servingMilliliters,servingTranslations:row.servingTranslations,portions:row.portions};
  this.openIngredientDetail({resource,kind:'foods',source,language:this.panel.language,unit:this.panel.energyUnit,catalog:this.nutrients,sourceLabel:typeof row.source==='string'?row.source:row.source?.name||row.source?.dataset||'',applyLabel:this.m('applyQuantity'),positiveOnly:true,
   normalize:value=>value.amount===undefined?value:{quantity:value.amount,unit:'servings'},
   preview:async(quantity,signal)=>{const expected={ref:row.ref,...quantity},result=(await localSuggestedIngredient({date:this.panel.date,row:expected}))??await this.panel.request('/api/insights/meals/ingredient-preview',{method:'POST',body:JSON.stringify({date:this.panel.date,row:expected}),signal});const actual=result?.row;if(actual?.ref?.kind!==row.ref.kind||actual.ref.id!==row.ref.id||actual.quantity!==quantity.quantity||actual.unit!==quantity.unit||actual.portionId!==quantity.portionId)throw Error(this.m('previewMismatch'));return result;},
   onApply:quantity=>{if(!draft.current(version))throw Error(this.m('changed'));this.closeQuantity();void draft.updateQuantity(rowIndex,quantity);}});
 }
 openIngredientDetail(options){
  this.closeQuantity();const dialog=document.createElement('dialog');this.quantityDialog=dialog;this.quantityOrigin=document.activeElement;dialog.className='mci-dialog ms-quantity-dialog';dialog.setAttribute('aria-label',options.resource.name);
  dialog.addEventListener('cancel',event=>{if(event.target!==dialog)return;event.preventDefault();event.stopPropagation();this.closeQuantity()});dialog.addEventListener('click',event=>{if(event.target.closest('[data-mci-back]'))this.closeQuantity();else if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)this.closeQuantity();}});document.body.append(dialog);dialog.showModal();
  this.quantityDetail=new MobileIngredientDetail({root:dialog,language:this.panel.language,unit:this.panel.energyUnit,catalog:this.nutrients,positiveOnly:true,compact:true,...options});
 }
 async selectIngredient(row,draft,dialog){
  this.selectionRequest?.abort();const controller=new AbortController();this.selectionRequest=controller;const selectionVersion=++this.selection,draftVersion=draft.version,selection={kind:row.kind,id:row.id},error=dialog.querySelector('[data-ms-search-error]');error.hidden=true;
  const preview=async(quantity,signal)=>{const result=await this.panel.request('/api/insights/meals/ingredient',{method:'POST',body:JSON.stringify({selection,date:this.panel.date,quantity}),signal});if(result?.selection?.kind!==selection.kind||result.selection.id!==selection.id||!result.resource||!Array.isArray(result.rows)||!result.rows.length||['amount','quantity','unit','portionId'].some(key=>result.quantity?.[key]!==quantity[key]))throw Error(this.m('previewMismatch'));return result;};
  try{
   const initial=await preview({amount:1},controller.signal);
   if(this.picker!==dialog||selectionVersion!==this.selection)return;
   this.openIngredientDetail({resource:{...initial.resource,quantityOptions:initial.quantityOptions},kind:initial.kind,context:initial.context,source:{amount:1},sourceLabel:typeof initial.resource.source==='string'?initial.resource.source:initial.resource.source?.name||initial.resource.source?.dataset||'',applyLabel:this.m('addToMeal'),preview,
    onApply:(_quantity,result)=>{if(!draft.current(draftVersion))throw Error(this.m('changed'));this.closeQuantity();this.closeSearch();void draft.append(result.rows);}});
  }catch(reason){if(this.picker===dialog&&selectionVersion===this.selection){error.textContent=reason.message;error.hidden=false;}}
 }
 closeQuantity(){this.quantityDetail?.dispose();this.quantityDetail=null;this.quantityDialog?.close();this.quantityDialog?.remove();this.quantityDialog=null;if(this.quantityOrigin?.isConnected)this.quantityOrigin.focus();this.quantityOrigin=null;}
 openSearch(index){this.closeSearch();const draft=this.drafts[index];if(!draft)return;const dialog=document.createElement('dialog');this.picker=dialog;dialog.className='ms-picker';dialog.setAttribute('aria-label',this.m('addItem'));dialog.innerHTML='<div data-ms-search></div><p data-ms-search-error role="alert" hidden></p>';dialog.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();this.back()});dialog.addEventListener('click',event=>{if(event.target===dialog)this.back()});document.body.append(dialog);dialog.showModal();
 this.search=new MobileFoodSearch({root:dialog.querySelector('[data-ms-search]'),language:this.panel.language,request:this.panel.request,defaults:{},onClose:()=>this.closeSearch(),onPick:row=>this.selectIngredient(row,draft,dialog)});dialog.querySelector('#food-search').focus();}
 closeSearch(){this.selection++;this.selectionRequest?.abort();this.selectionRequest=null;this.search?.dispose();this.search=null;this.picker?.close();this.picker?.remove();this.picker=null;}
 dispose(){this.clearDrafts();this.filterOptions?.close();this.options?.close();}
}
