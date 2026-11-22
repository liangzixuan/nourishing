import {quantityDescription} from './quantity-description.js';
import {MobileMealSuggestionsView} from './mobile-meal-suggestions.js';
import {formatMessage} from '../report-source/public/message-format.js';
import {mealSuggestionGuidanceText} from './meal-suggestion-presentation.js';
import {mealReferenceKey as key} from './meal-suggestion-policy.mjs';
import {parseMealSuggestionOptions} from './meal-suggestion-options.mjs';
import {renderSourceAttributions} from './source-attribution.js';
import {displayValue,displayUnit} from '../dashboard-source/energy-display.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaults=()=>({diets:[],categories:[],exclusions:[],includeCustom:false,includeUnknownTags:false});
const button=(label,action,attrs='',style='')=>`<button type="button" class="btn ${style}" data-meal-action="${action}" ${attrs}>${label}</button>`;
const choices=(m,scope,field,values,selected)=>`<fieldset class="meal-filter-choices"><legend>${esc(m(field==='diets'?'diets':field==='categories'?'categories':scope==='filter'?'excludeIngredients':'ingredientsPresent'))}</legend>${values.map(value=>`<label><input type="checkbox" data-meal-${scope}="${field}" value="${value}" ${selected.includes(value)?'checked':''}> ${esc(m('choice.'+value))}</label>`).join('')}</fieldset>`;
export class MealSuggestionsPanel{
  constructor({root,request,date,session={},onSelect,onPreferences=()=>{},energyUnit='kcal',language='en',mobile=null}){
    this.language=language;this.m=(key,values)=>formatMessage(language,'mealSuggestions.'+key,values);this.format=value=>Number.isFinite(value)?value.toLocaleString(language,{maximumFractionDigits:1}):this.m('unknown');
    Object.assign(this,{root,request,date,host:session,onSelect,onPreferences,energyUnit,disposed:false,version:0,options:null,result:null,preferencePending:false,refreshing:false});
    session.filters??=defaults();session.omit??=[];session.offset??=0;session.tagDrafts??=new Map();
    this.mobile=mobile?new MobileMealSuggestionsView(this,mobile):null;
    this.click=event=>{const control=event.target.closest('[data-meal-action]');if(!control||!root.contains(control))return;event.preventDefault();this.handle(control).catch(error=>this.error(this.errorText(error)));};
    this.change=event=>{if(event.target.matches('[data-meal-filter],#meal-custom,#meal-unknown'))this.filtersChanged();if(event.target.id==='meal-tag-resource'){this.host.tagSelection=event.target.value;this.renderTagFields();}if(event.target.matches('[data-meal-tag]')&&!this.preferencesBlocked())this.captureTagDraft();};
    root.addEventListener('click',this.click);root.addEventListener('change',this.change);this.render();this.start();
  }
  errorText(error){return error.mealOptionsCode==='invalid-options'?this.m('invalidOptions'):error.message||String(error);}
  ingredientQuantity(row){if(row.unit==='portion')return quantityDescription({kind:'portion',value:row.quantity,label:row.portions?.find(portion=>portion.id===row.portionId)?.label},this.language);const amount=this.format(row.quantity);return row.unit==='servings'?this.m('servings',{count:row.quantity,amount}):amount+' '+row.unit;}
  render(){if(this.mobile)return this.mobile.render();const m=this.m,format=this.format;this.root.innerHTML=`<section class="card meal-suggestions"><div class="card-head"><div><h2>${esc(m('title'))}</h2><p>${esc(m('forDate',{date:this.date}))}</p></div></div><div class="card-body"><p>${esc(m('intro'))}</p><div data-meal-filters></div><div class="row wrap meal-toolbar">${button(esc(this.m('get')),'get','','primary')}${button(esc(this.m('reset')),'reset')}${button(esc(this.m('resetResults')),'reset-results')}</div><p class="mini-note">${esc(m('tagHelp'))}</p><details class="meal-tag-editor"><summary>${esc(m('reviewTags'))}</summary><div data-meal-tags></div></details><p class="mini-note">${esc(m('reloadHelp'))}</p>${button(esc(this.m('reload')),'refresh-preferences')}<div data-meal-excluded></div><p data-meal-error class="dialog-error" role="alert" hidden></p><p data-meal-status role="status"></p><div data-meal-results></div></div></section>`;this.renderFilters();}
  async start(){
    this.refreshing=true;this.controls();
    try{
      if(this.host.preferenceTask){this.root.querySelector('[data-meal-status]').textContent=this.m('waiting');await this.host.preferenceTask;}
      if(this.disposed)return;
      const options=parseMealSuggestionOptions(await this.request('/api/insights/meals/options'));
      if(this.disposed)return;
      this.options=options;this.host.preferenceUnknown=false;this.renderFilters();this.renderTags();this.renderExclusions();if(!this.mobile||this.mobile.screen==='results')await this.load();
    }catch(error){if(!this.disposed)this.error(this.errorText(error));}
    finally{this.refreshing=false;this.controls();}
  }
  preferencesBlocked(){return this.preferencePending||this.refreshing||!!this.host.preferenceTask||!!this.host.preferenceUnknown;}
  controls(){
    if(this.disposed)return;
    this.mobile?.controls();
    const blocked=this.preferencesBlocked();
    for(const node of this.root.querySelectorAll('[data-meal-tag],#meal-tag-resource,[data-meal-action="tags"],[data-meal-action="clear-tags"],[data-meal-action="less"],[data-meal-action="exclude"],[data-meal-action="restore-excluded"]'))node.disabled=blocked;
    this.root.querySelector('[data-meal-action="refresh-preferences"]').disabled=this.preferencePending||this.refreshing||!!this.host.preferenceTask;
  }
  captureTagDraft(){
    const item=this.selectedCustom();if(!item?.available)return;
    const id=key(item.ref),previous=this.host.tagDrafts.get(id);
    const draft={ref:item.ref,revision:previous?.revision??item.revision,tags:Object.fromEntries(['diets','categories','exclusions'].map(field=>[field,[...this.root.querySelectorAll(`[data-meal-tag="${field}"]:checked`)].map(node=>node.value)]))};
    this.host.tagDrafts.set(id,draft);const status=this.root.querySelector('[data-meal-tag-status]');if(status)status.textContent=this.m('draft');return draft;
  }
  async refreshPreferences(){
    if(this.preferencePending||this.refreshing||this.host.preferenceTask)return;
    this.refreshing=true;this.controls();this.error('');
    try{
      const options=parseMealSuggestionOptions(await this.request('/api/insights/meals/options'));
      if(this.disposed)return;
      this.options=options;this.host.tagDrafts.clear();this.host.preferenceUnknown=false;this.renderFilters();this.renderTags();this.renderExclusions();if(!this.mobile||this.mobile.screen==='results')await this.load();
    }catch(error){if(!this.disposed)this.error(this.errorText(error));}
    finally{this.refreshing=false;this.controls();}
  }
  renderFilters(){if(this.mobile)return this.mobile.renderFilters();const m=this.m,format=this.format;const f=this.host.filters,o=this.options,target=this.root.querySelector('[data-meal-filters]');target.innerHTML=o?`<div class="meal-filter-grid">${choices(m,'filter','diets',o.diets,f.diets)}${choices(m,'filter','categories',o.categories,f.categories)}<div>${choices(m,'filter','exclusions',o.exclusions,f.exclusions)}<p class="mini-note">${esc(m('excludeHelp'))}</p></div></div><label class="meal-check"><input id="meal-custom" type="checkbox" ${f.includeCustom?'checked':''}> ${esc(m('includeCustom'))}</label><label class="meal-check"><input id="meal-unknown" type="checkbox" ${f.includeUnknownTags?'checked':''}> ${esc(m('includeUnknown'))}</label><p class="mini-note">${esc(m('unknownHelp'))}</p>`:`<p>${esc(m('loadingFilters'))}</p>`;}
  filtersChanged(){this.host.filters={...Object.fromEntries(['diets','categories','exclusions'].map(field=>[field,[...this.root.querySelectorAll(`[data-meal-filter="${field}"]:checked`)].map(node=>node.value)])),includeCustom:this.root.querySelector('#meal-custom').checked,includeUnknownTags:this.root.querySelector('#meal-unknown').checked};this.host.offset=0;this.invalidate(this.mobile?'':this.m('filtersChanged'));this.mobile?.filterSummary();}
  invalidate(message){this.mobile?.clearDrafts();this.version++;this.controller?.abort();this.result=null;this.root.querySelector('[data-meal-results]').innerHTML='';this.root.querySelector('[data-meal-status]').textContent=message;}
  async load(){
    this.mobile?.showResults();
    this.controller?.abort();const controller=new AbortController();this.controller=controller;const version=++this.version;this.result=null;this.error(this.host.preferenceUnknown?this.m('unknownOutcome'):'');this.root.querySelector('[data-meal-status]').textContent=this.m('loading');this.root.querySelector('[data-meal-results]').innerHTML='';
    try{const data=await this.request('/api/insights/meals/suggest',{method:'POST',signal:controller.signal,body:JSON.stringify({date:this.date,filters:this.host.filters,omit:this.host.omit,offset:this.host.offset,limit:this.mobile?5:4})});if(this.disposed||version!==this.version)return;this.result=data;this.renderResults();}
    catch(error){if(!this.disposed&&version===this.version&&error.name!=='AbortError'){this.root.querySelector('[data-meal-status]').textContent=this.m('loadFailed');this.error(this.errorText(error));this.mobile?.loadFailed();}}
  }
  renderResults(){if(this.mobile)return this.mobile.renderResults();const m=this.m,format=this.format;const r=this.result;if(!r)return;this.root.querySelector('[data-meal-status]').textContent=m('results',{total:format(r.total),filtered:format(r.coverage.filteredOut),excluded:format(r.coverage.alwaysExcluded),unavailable:format(r.coverage.unavailable.length)});
    this.root.querySelector('[data-meal-results]').innerHTML=`<div class="meal-result-grid">${r.items.map((item,index)=>`<article class="meal-result" data-meal-id="${esc(key(item.ref))}"><h3>${esc(item.name)}</h3>${renderSourceAttributions(item.attributions)}<p class="mini-note">${esc(m(item.ref.kind==='template'?'template':'saved.'+item.ref.kind))} · ${esc(m(item.tagStatus==='unknown'?'tagsUnknown':item.tagStatus==='changed-since-review'?'tagsChanged':'tagged'))}${item.lessOften?' · '+esc(m('lessOften')):''}</p><p class="meal-macros">${['calories','protein','carbs','fat'].map(id=>`${format(displayValue(item.nutrition.totals[id],id==='calories'?'kcal':'g',this.energyUnit))} ${esc(displayUnit(id==='calories'?'kcal':'g',this.energyUnit))} ${esc(m(id==='calories'?'energy':id))}`).join(' · ')}</p><details><summary>${esc(m('ingredients',{count:item.rows.length,amount:format(item.rows.length)}))}</summary><ul>${item.rows.map(row=>`<li>${esc(row.name)} · ${esc(this.ingredientQuantity(row))}</li>`).join('')}</ul></details><p class="mini-note">${esc(m(item.ranking.personalized?'personalized':'notPersonalized'))} ${esc(m('missingNutrition'))}</p><div class="meal-actions">${button(esc(this.m('review')),'review',`data-index="${index}"`,'primary')}${button(esc(this.m('remove')),'remove',`data-index="${index}"`)}${button(esc(this.m('exclude')),'exclude',`data-index="${index}" ${this.preferencePending?'disabled':''}`)}${button(esc(item.lessOften?this.m('undoLess'):this.m('less')),'less',`data-index="${index}" ${this.preferencePending?'disabled':''}`)}</div></article>`).join('')}</div>${r.items.length?`<div class="meal-toolbar row wrap">${button(esc(r.nextOffset===null?this.m('startOver'):this.m('next')),'next')}<span class="mini-note">${esc(m('page',{start:format(r.offset+1),end:format(r.offset+r.items.length),total:format(r.total)}))}</span></div>`:`<div class="empty">${esc(m('noResults'))}</div>`}<details><summary>${esc(m('method'))}</summary>${r.limitations.map(line=>`<p class="mini-note">${esc(mealSuggestionGuidanceText(line,this.language))}</p>`).join('')}<p class="mini-note">${esc(m('ranking'))}</p>${r.coverage.unavailable.length?`<ul>${r.coverage.unavailable.map(row=>`<li>${esc(row.name)}: ${esc(mealSuggestionGuidanceText({code:row.reasonCode,text:row.reason},this.language))}</li>`).join('')}</ul>`:''}</details>`;
    this.controls();
  }
  renderExclusions(){const m=this.m,format=this.format;
    const items=this.options?.excluded??[];
    this.root.querySelector('[data-meal-excluded]').innerHTML=`<details data-meal-excluded-list><summary>${esc(m('excluded',{amount:format(items.length)}))}</summary><p>${esc(m('excludedHelp'))}</p>${items.length?`<ul>${items.map((item,index)=>`<li><span>${esc(item.name)}${item.available?'':' · '+esc(m('unavailable'))}</span> ${button(esc(this.m('restore')),'restore-excluded',`data-excluded-index="${index}" ${this.preferencePending?'disabled':''}`)}</li>`).join('')}</ul>`:`<p>${esc(m('noExcluded'))}</p>`}</details>`;
    this.controls();
  }
  renderTags(){const m=this.m,format=this.format;const target=this.root.querySelector('[data-meal-tags]'),items=this.options?.custom??[],old=this.host.tagSelection??target.querySelector('#meal-tag-resource')?.value??(items[0]?key(items[0].ref):'');target.innerHTML=items.length?`<p>${esc(m('reviewHelp'))}</p><label>${esc(m('savedItem'))}<select id="meal-tag-resource"><option value="" ${items.some(row=>key(row.ref)===old)?'':'selected'}>${esc(m('choose'))}</option>${items.map(row=>`<option value="${esc(key(row.ref))}" ${key(row.ref)===old?'selected':''}>${esc(row.name)} · ${esc(m('kind.'+row.ref.kind))}</option>`).join('')}</select></label><div data-meal-tag-fields></div>`:`<p>${esc(m('noCustom'))}</p>`;this.renderTagFields();this.controls();}
  selectedCustom(){const value=this.root.querySelector('#meal-tag-resource')?.value;return this.options?.custom.find(item=>key(item.ref)===value);}
  renderTagFields(){const m=this.m,format=this.format;const target=this.root.querySelector('[data-meal-tag-fields]');if(!target)return;const item=this.selectedCustom();if(!item){target.innerHTML=`<p>${esc(m('chooseHelp'))}</p>`;return;}const heading=`<p data-meal-selected-name>${esc(item.name)} · ${esc(m('kind.'+item.ref.kind))}</p>`;if(!item.available){target.innerHTML=heading+`<p>${esc(item.reason)}</p>`;return;}const draft=this.host.tagDrafts.get(key(item.ref)),tags=draft?.tags??item.tags??{diets:[],categories:[],exclusions:[]};target.innerHTML=heading+`<p class="mini-note" data-meal-tag-status>${draft?this.m('draft'):item.tagStatus==='reviewed'?this.m('reviewed'):item.tagStatus==='changed-since-review'?this.m('changed'):this.m('unreviewed')}</p><div class="meal-filter-grid">${choices(m,'tag','diets',this.options.diets,tags.diets)}${choices(m,'tag','categories',this.options.categories,tags.categories)}${choices(m,'tag','exclusions',this.options.exclusions,tags.exclusions)}</div><p class="mini-note">${esc(m('ingredientHelp'))}</p><div class="row wrap">${button(esc(this.m('save')),'tags',this.preferencePending?'disabled':'')}${button(esc(this.m('clear')),'clear-tags',this.preferencePending?'disabled':'')}</div>`;this.controls();}
  async preference(input){
    if(this.preferencesBlocked())return;
    this.preferencePending=true;this.error('');this.invalidate(this.m('saving'));
    // The session owns the request outcome even after the initiating panel is disposed.
    const task=Promise.resolve().then(async()=>{
      try{
        const response=await this.request('/api/insights/meals/preferences',{method:'POST',signal:AbortSignal.timeout(30000),body:JSON.stringify(input)});
        const options=parseMealSuggestionOptions(response?.preferences);
        this.host.preferenceUnknown=false;
        if(input.action==='tags')this.host.tagDrafts.delete(key(input.ref));
        return {options};
      }catch(error){
        this.host.preferenceUnknown=!(error.status>=400&&error.status<500&&error.status!==408);
        return {error,unknown:this.host.preferenceUnknown};
      }finally{
        if(this.host.preferenceTask===task)this.host.preferenceTask=null;
        this.onPreferences();
      }
    });
    this.host.preferenceTask=task;this.controls();
    try{
      const outcome=await task;if(this.disposed)return;
      if(outcome.error){this.error((outcome.unknown?this.m('unknownOutcome')+' ':'')+this.errorText(outcome.error));this.root.querySelector('[data-meal-status]').textContent=this.m('needsReview');return;}
      this.options=outcome.options;this.renderTags();this.renderExclusions();this.host.offset=0;if(!this.mobile||this.mobile.screen==='results')await this.load();
    }finally{this.preferencePending=false;this.controls();}
  }
  async handle(control){const action=control.dataset.mealAction,item=this.result?.items[Number(control.dataset.index)];switch(action){case 'refresh-preferences':return this.refreshPreferences();case 'get':this.host.offset=0;return this.load();case 'reset':this.host.filters=defaults();this.host.offset=0;this.host.omit=[];this.renderFilters();if(this.mobile){this.invalidate('');this.mobile.resetFilters();return;}return this.load();case 'reset-results':this.host.offset=0;this.host.omit=[];return this.load();case 'next':if(!this.result)return;this.host.offset=this.result.nextOffset??0;return this.load();case 'review':if(item)return this.onSelect(this.mobile?this.mobile.reviewedItem(Number(control.dataset.index)):item);break;case 'remove':if(item&&!this.host.omit.some(ref=>key(ref)===key(item.ref)))this.host.omit.push(item.ref);this.host.offset=0;return this.load();case 'exclude':if(item)return this.preference({action:'exclude',ref:item.ref,excluded:true});break;case 'restore-excluded':{const excluded=this.options?.excluded[Number(control.dataset.excludedIndex)];if(excluded)return this.preference({action:'exclude',ref:excluded.ref,excluded:false});break;}case 'less':if(item)return this.preference({action:'feedback',ref:item.ref,lessOften:!item.lessOften});break;case 'tags':case 'clear-tags':{const selected=this.selectedCustom();if(!selected?.available)return;if(this.preferencesBlocked())return;const draft=this.captureTagDraft();return this.preference({action:'tags',ref:selected.ref,revision:draft.revision,tags:action==='clear-tags'?null:draft.tags});}}}
  error(message){if(this.disposed)return;this.lastError=message;if(this.mobile)return this.mobile.error(message);const node=this.root.querySelector('[data-meal-error]');node.hidden=!message;node.textContent=message;}
  back(){return this.mobile?.back()??false;}
  dispose(){this.mobile?.dispose();this.disposed=true;this.version++;this.controller?.abort();this.root.removeEventListener('click',this.click);this.root.removeEventListener('change',this.change);}
}
