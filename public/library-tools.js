import {request,command} from './diary-api.js';
import {escape as e} from './html.js';

export async function openLibraryTools({kind,id,show,close,header,content,onChange=async()=>{},onBack=close}){
 let data;
 const read=async()=>{data=await request('/api/library/tools?'+new URLSearchParams({kind,id}));};
 show(header('Portions & Visibility')+'<p class="empty">Loading…</p>');const loading=content.lastElementChild;
 try{await read();if(loading.isConnected)menu();}catch(error){if(loading.isConnected)loading.textContent=error.message;}
 function menu(){
  show(`${header(data.review.name)}<div class="library-tools-menu">${kind==='meal'?'':'<button type="button" data-portions>Named portions<span>›</span></button>'}<button type="button" data-retirement>${data.review.retired?'Restore to library':'Retire from library'}<span>›</span></button><button type="button" data-back>Back</button></div>`);
  content.querySelector('[data-portions]')?.addEventListener('click',portions);
  content.querySelector('[data-retirement]').onclick=retirement;content.querySelector('[data-back]').onclick=onBack;
 }
 async function save(form,type,payload){
  const status=form.querySelector('[role=status]');status.replaceChildren();form.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{await command(data.revision,type,payload);await onChange();await read();if(form.isConnected)menu();}
  catch(error){if(form.isConnected){status.textContent=error.message;if(error.status===409){const reload=document.createElement('button');reload.type='button';reload.textContent='Review latest';reload.onclick=async()=>{try{await read();if(form.isConnected)menu();}catch(error){if(form.isConnected)status.textContent=error.message;}};status.append(reload);}}}
  finally{form.querySelectorAll('button').forEach(button=>button.disabled=false);}
 }
 function retirement(){
  const retired=!data.review.retired,label=retired?'Retire':'Restore',counts=Object.entries(data.review.counts).filter(([,count])=>count>0).map(([key,count])=>`${count} ${key==='entries'?'diary entries':key}`).join(' · ');
  show(`${header(label+' '+data.review.name)}<form class="library-tools-form"><p class="sheet-message">${retired?'Hide from new food choices. Existing records stay.':'Show in food choices again.'}</p>${counts?`<p class="library-uses">${e(counts)}</p>`:''}<p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" data-back>Back</button><button type="submit" class="primary">${label}</button></footer></form>`);
  const form=content.querySelector('form');form.querySelector('[data-back]').onclick=menu;form.onsubmit=event=>{event.preventDefault();save(form,'library.retirement',{kind,id,retired,fingerprint:data.review.fingerprint,confirmed:true});};
 }
 function portions(){
  show(`${header('Named Portions')}<form class="library-tools-form"><div data-portions-list></div><button type="button" class="more-results" data-add-portion>＋ Add portion</button><p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" data-back>Back</button><button type="submit" class="primary">Save</button></footer></form>`);
  const form=content.querySelector('form'),list=form.querySelector('[data-portions-list]'),rows=[];
  const field=(name,label,value,extra='')=>`<label class="field-row"><span>${e(label)}</span><input data-field="${name}" aria-label="${e(label)}" value="${e(value)}" ${extra}></label>`;
  function append(portion){
   const node=document.createElement('section'),recipe=kind==='recipe';node.className='library-portion';
   const basis=recipe?portion.basis:portion.milliliters!==undefined?'volume':'weight',basisOptions=recipe?[['batch','Batch fraction'],['weight','Weight'],['volume','Volume']]:[['weight','Weight'],['volume','Volume']];
   node.innerHTML=field('label','Portion name',portion.label,'required maxlength="500"')+`<label class="field-row"><span>Measure</span><select data-field="basis" aria-label="Measure">${basisOptions.map(([id,label])=>`<option value="${id}" ${basis===id?'selected':''}>${label}</option>`).join('')}</select></label>`+field('value','Amount',portion[basis==='batch'?'portionsPerBatch':basis==='volume'?'milliliters':'grams']??'','type="number" required min="0.000001" max="10000000" step="any"')+(recipe?field('quantity','Portion count',portion.quantity??1,'type="number" required min="0.000001" max="100000" step="any"'):'')+'<button type="button" class="more-results" data-remove>Remove portion</button>';
   const row={id:portion.id,node,quantitySpecified:portion.quantity!==undefined};rows.push(row);list.append(node);
   const update=()=>{const value=node.querySelector('[data-field=value]'),basis=node.querySelector('select').value,label=basis==='batch'?'Portions per batch':basis==='volume'?'Volume (mL)':'Weight (g)';value.setAttribute('aria-label',label);value.previousElementSibling.textContent=label;value.max=basis==='batch'?'100000':'10000000';};
   node.querySelector('select').onchange=update;update();node.querySelector('[data-remove]').onclick=()=>{rows.splice(rows.indexOf(row),1);node.remove();sync();};sync();return node;
  }
  function sync(){form.querySelector('[data-add-portion]').disabled=rows.length>=1000;}
  data.portions.forEach(append);
  form.querySelector('[data-add-portion]').onclick=()=>append({id:crypto.randomUUID(),label:'',...(kind==='recipe'?{basis:'batch',portionsPerBatch:1}:{grams:100})}).querySelector('input').focus();
  form.querySelector('[data-back]').onclick=menu;
  form.onsubmit=event=>{event.preventDefault();const portions=rows.map(({id,node,quantitySpecified})=>{const value=name=>node.querySelector(`[data-field=${name}]`).value,basis=value('basis'),quantity=kind==='recipe'?Number(value('quantity')):undefined;return {id,label:value('label'),...(kind==='recipe'?{basis,...(quantitySpecified||quantity!==1?{quantity}:{})}:{}),[basis==='batch'?'portionsPerBatch':basis==='volume'?'milliliters':'grams']:Number(value('value'))};});save(form,'library.portions',{kind,id,portions});};
 }
}
