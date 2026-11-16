import {formatMessage} from '../report-source/public/message-format.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const invalid=message=>{throw Error(message);};

/** Edit additional measured portions without changing the food's nutrient basis.
 * IDs belong to this editor's rows, not editable form fields. */
export class FoodPortionsEditor{
  constructor({root,portions=[],gramsInput,volumeInput,onChange=()=>{},language='en',presentation='standard',removeIcon=''}){
    this.language=language;this.message=(key,values)=>formatMessage(this.language,'foodPortions.'+key,values);
    this.compact=presentation==='mobile';this.removeIcon=removeIcon;root.classList.toggle('mobile-portions',this.compact);
    if(!Array.isArray(portions)||portions.length>1000)invalid(this.message('limit'));
    this.root=root;this.gramsInput=gramsInput;this.volumeInput=volumeInput;this.onChange=onChange;this.change=event=>{const row=event.target.closest('[data-portion-row]');if(this.compact&&row&&event.target.matches('[data-portion-basis]'))row.querySelector('[data-portion-measure-label]').textContent=this.message(event.target.value==='milliliters'?'mobileVolume':'mobileWeight');onChange();};root.addEventListener('change',this.change);this.rows=[];this.disposed=false;
    root.innerHTML=`<section class="food-portions-editor"><div class="food-portions-heading"><h3>${escape(this.message('title'))}</h3><button type="button" class="btn subtle" data-portion-add>${escape(this.message('add'))}</button></div><p class="food-portions-help">${escape(this.message('help'))}</p><p class="food-portions-status" data-portion-status role="status" aria-live="polite"></p><div data-portion-list></div><p class="food-portions-empty" data-portion-empty>${escape(this.message('empty'))}</p></section>`;
    this.list=root.querySelector('[data-portion-list]');
    if(this.compact)root.querySelector('[data-portion-add]').textContent=this.message('mobileAdd');
    this.click=event=>{
      const add=event.target.closest('[data-portion-add]'),remove=event.target.closest('[data-portion-remove]');
      if(add&&root.contains(add)){event.preventDefault();this.add();}
      else if(remove&&root.contains(remove)){event.preventDefault();this.remove(remove.closest('[data-portion-row]'));}
    };
    this.basis=()=>this.sync();root.addEventListener('click',this.click);for(const input of [gramsInput,volumeInput].filter(Boolean)){input.addEventListener('input',this.basis);input.addEventListener('change',this.basis);}
    for(const portion of portions)this.append(portion);
    this.sync();
  }
  knownBasis(){return [this.gramsInput,this.volumeInput].some(input=>input&&input.value.trim()!==''&&Number.isFinite(Number(input.value))&&Number(input.value)>0);}
  append(portion){
    const element=this.root.ownerDocument.createElement('div');element.className='food-portion-row';element.setAttribute('data-portion-row','');
    element.innerHTML=`<input type="hidden" data-portion-id value="${escape(portion?.id)}"><label>${escape(this.message('label'))}<input type="text" data-portion-label value="${escape(portion?.label)}" required maxlength="500" placeholder="${escape(this.message('example'))}"></label><label>${escape(this.message('basis'))}<select data-portion-basis><option value="grams"${portion?.milliliters===undefined?' selected':''}>g</option><option value="milliliters"${portion?.milliliters!==undefined?' selected':''}>mL</option></select></label><label>${escape(this.message('measurement'))}<input type="number" data-portion-grams value="${escape(portion?.milliliters??portion?.grams)}" required min="0.000001" max="10000000" step="any"></label><button type="button" class="btn subtle food-portion-remove" data-portion-remove aria-label="${escape(this.message('removeLabel'))}">${escape(this.message('remove'))}</button>`;
    if(this.compact){
      const name=element.querySelector('[data-portion-label]').closest('label'),unit=element.querySelector('[data-portion-basis]').closest('label'),measurement=element.querySelector('[data-portion-grams]').closest('label'),remove=element.querySelector('[data-portion-remove]');
      name.className='portion-name';name.firstChild.textContent=this.message('mobileName');unit.className='portion-unit';unit.firstChild.textContent='';unit.querySelector('select').setAttribute('aria-label',this.message('basis'));
      measurement.className='portion-measure';const label=document.createElement('span');label.dataset.portionMeasureLabel='';label.textContent=this.message(portion?.milliliters!==undefined?'mobileVolume':'mobileWeight');measurement.firstChild.replaceWith(label);
      remove.innerHTML=this.removeIcon||escape(this.message('remove'));element.append(name,measurement,unit,remove);
    }
    this.rows.push({id:portion?.id,element});this.list.append(element);return element;
  }
  add(){
    if(this.disposed||!this.knownBasis()||this.rows.length>=1000)return;
    const element=this.append({id:this.root.ownerDocument.defaultView.crypto.randomUUID(),label:'',...(this.volumeInput?.value&&!this.gramsInput.value?{milliliters:''}:{grams:''})});this.sync();this.onChange();element.querySelector('[data-portion-label]').focus();
  }
  remove(element){
    if(this.disposed)return;const index=this.rows.findIndex(row=>row.element===element);if(index<0)return;
    this.rows.splice(index,1);element.remove();this.sync();this.onChange();
    const target=this.rows[Math.min(index,this.rows.length-1)]?.element.querySelector('[data-portion-label]')||(this.knownBasis()?this.root.querySelector('[data-portion-add]'):this.gramsInput);target.focus();
  }
  sync(){
    if(this.disposed)return;const known=this.knownBasis(),limit=this.rows.length>=1000;
    this.root.querySelector('[data-portion-add]').disabled=!known||limit;
    this.root.querySelector('[data-portion-empty]').hidden=this.rows.length>0;
    this.root.querySelector('[data-portion-status]').textContent=!known?this.message(this.compact?'mobileUnknownBasis':'unknownBasis'):limit?this.message('maximum'):this.message('count',{count:this.rows.length});
  }
  read(){
    if(this.disposed)invalid(this.message('disposed'));
    if(this.rows.length&&!this.knownBasis())invalid(this.message('missingBasis'));
    const seen=new Set();
    return this.rows.map(({id,element},index)=>{
      if(typeof id!=='string'||!id.trim()||id.length>200||seen.has(id))invalid(this.message('identity',{index:index+1}));seen.add(id);
      const basis=element.querySelector('[data-portion-basis]').value,input=basis==='milliliters'?this.volumeInput:this.gramsInput;if(!input?.value.trim()||!Number.isFinite(Number(input.value))||Number(input.value)<=0)invalid(this.message(basis==='milliliters'?'needsVolume':'needsWeight',{index:index+1}));
      const label=element.querySelector('[data-portion-label]').value,value=element.querySelector('[data-portion-grams]').value,grams=Number(value);
      if(!label.trim()||label.length>500)invalid(this.message('invalidLabel',{index:index+1}));
      if(value.trim()===''||!Number.isFinite(grams)||grams<0.000001||grams>10000000)invalid(this.message('invalidMeasurement',{index:index+1}));
      return {id,label:label.trim(),[basis]:grams};
    });
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.root.removeEventListener('change',this.change);this.root.removeEventListener('click',this.click);for(const input of [this.gramsInput,this.volumeInput].filter(Boolean)){input.removeEventListener('input',this.basis);input.removeEventListener('change',this.basis);}}
}
