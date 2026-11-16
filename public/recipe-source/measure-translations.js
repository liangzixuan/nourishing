import {formatMessage} from '../report-source/public/message-format.js';
import {uiLanguage} from './ui-language.js';
import {measureLocales,parseMeasureTranslations,measureTranslationErrors} from '../report-source/server/measure-translations.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const portionKey=id=>'portion:'+id;
/** Translation state follows a measure identity, never a row position or weight. */
export class MeasureTranslationsEditor{
 constructor({root,resource={},measures,language=uiLanguage()}){
  this.language=language;this.message=(key,values)=>formatMessage(this.language,'measureEditor.'+key,values);this.languageNames=new Intl.DisplayNames([language],{type:'language'});
  this.root=root;this.measures=measures;this.names=new Map([['serving',this.parse(resource.servingTranslations)]]);
  for(const portion of resource.portions??[])this.names.set(portionKey(portion.id),this.parse(portion.translations));
  this.locale='';this.open=false;this.disposed=false;
  this.click=event=>{const action=event.target.closest('[data-measure-action]')?.dataset.measureAction;if(!action)return;event.preventDefault();this.collect();const select=root.querySelector('[data-measure-language]');this.locale=select.value;this.open=true;
   if(action==='copy'){for(const measure of this.measures()){const rows=this.names.get(measure.key)??[];if(!rows.some(row=>row.locale===this.locale))this.names.set(measure.key,[...rows,{locale:this.locale,label:measure.label}]);}}
   if(action==='remove'){for(const [key,rows]of this.names)this.names.set(key,rows.filter(row=>row.locale!==this.locale));this.locale='';}
   this.render();
  };
  this.change=event=>{if(event.target.matches('[data-measure-language]')){this.collect();this.locale=event.target.value;this.open=true;this.render();}else if(event.target.matches('[data-measure-enabled]')){const row=event.target.closest('[data-measure-row]'),input=row.querySelector('[data-measure-label]');input.disabled=!event.target.checked;input.required=event.target.checked;if(event.target.checked)input.focus();}};
  this.invalid=()=>{root.querySelector('details').open=true;};root.addEventListener('click',this.click);root.addEventListener('change',this.change);root.addEventListener('invalid',this.invalid,true);this.render();
 }
 collect(){if(!this.locale)return;for(const row of this.root.querySelectorAll('[data-measure-row]')){const key=row.dataset.measureRow,rows=(this.names.get(key)??[]).filter(item=>item.locale!==this.locale);if(row.querySelector('[data-measure-enabled]').checked)rows.push({locale:this.locale,label:row.querySelector('[data-measure-label]').value});this.names.set(key,rows);}}
 render(){
  const measures=this.measures(),existing=new Set(measures.map(row=>row.key));for(const key of this.names.keys())if(!existing.has(key))this.names.delete(key);
  const active=new Set([...this.names.values()].flatMap(rows=>rows.map(row=>row.locale)));
  this.root.innerHTML=`<details data-measure-translations-editor${this.open?' open':''}><summary>${escape(this.message('title'))}</summary><label>${escape(this.message('language'))}<select data-measure-language><option value="">${escape(this.message('choose'))}</option>${measureLocales.map(item=>`<option value="${item.id}"${item.id===this.locale?' selected':''}>${escape(this.languageNames.of(item.id.replace('_','-')))}${active.has(item.id)?escape(this.message('hasLabels')):''}</option>`).join('')}</select></label>${this.locale?`<div class="button-row"><button type="button" class="btn subtle" data-measure-action="copy">${escape(this.message('copy'))}</button><button type="button" class="btn subtle" data-measure-action="remove">${escape(this.message('remove'))}</button></div><div>${measures.map(measure=>{const translation=(this.names.get(measure.key)??[]).find(row=>row.locale===this.locale);return `<div data-measure-row="${escape(measure.key)}" class="recipe-measure-translation"><label><input type="checkbox" data-measure-enabled${translation?' checked':''}> ${escape(this.message('translate',{label:measure.label||this.message('unnamed')}))}</label><input aria-label="${escape(this.message('translated',{label:measure.label||this.message('portion')}))}" data-measure-label value="${escape(translation?.label??'')}" maxlength="500"${translation?' required':' disabled'}></div>`;}).join('')}</div>`:''}</details>`;
 }
 parse(value){try{return parseMeasureTranslations(value);}catch(error){if(Object.hasOwn(measureTranslationErrors,error.measureTranslationCode)){const details=this.root?.querySelector('details');if(details)details.open=true;throw Object.assign(Error(this.message(error.measureTranslationCode)),{status:error.status,measureTranslationCode:error.measureTranslationCode});}throw error;}}
 refresh(){if(this.disposed)return;this.open=this.root.querySelector('details')?.open??this.open;this.collect();this.render();}
 apply(resource){
  if(this.disposed)throw Error(this.message('disposed'));this.collect();
  const {servingTranslations,...result}=resource,serving=this.parse(this.names.get('serving'));if(serving.length)result.servingTranslations=serving;
  if(resource.portions!==undefined)result.portions=resource.portions.map(({translations,...portion})=>{const rows=this.parse(this.names.get(portionKey(portion.id)));return {...portion,translations:rows};});
  return result;
 }
 dispose(){this.disposed=true;this.root.removeEventListener('click',this.click);this.root.removeEventListener('change',this.change);this.root.removeEventListener('invalid',this.invalid,true);}
}
