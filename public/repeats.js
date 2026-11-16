import {mobileRepeatsHeader,mobileRepeatsMarkup,MobileRepeatList,mobileRepeatForm,MobileRepeatEditor} from './repeat-source/mobile-repeats.js';
import {icon} from './repeat-source/icons.js';
import {request, command} from './diary-api.js';
import {escape as e} from './html.js';
import {mountFoodPicker} from './food-picker.js';
import {quantityFields, quantityValue} from './quantity.js';

const num = value => Number.isFinite(value) ? value.toLocaleString(undefined, {maximumFractionDigits: 2}) : '—';
const quantity = row => `${num(row.quantity ?? row.amount ?? 1)} ${row.unit === 'portion' ? row.portionLabel ?? 'portions' : row.unit ?? 'servings'}`;
const reviewQuantity = row => `${num(row.value)} ${row.label ?? row.unit ?? (row.kind === 'batch' ? 'batch' : 'servings')}`;

export function mountRepeats({page, show, close, header, content, date, headerRoot, onExit, onChange = async () => {}}) {
  let data, disposed = false, serial = 0, pickerCleanup, list, editorController, query='';
  const events=new AbortController();document.body.classList.add('repeats-mobile');
  const root = document.createElement('section');
  root.className = 'repeat-page';
  page.replaceChildren(root);
  const alive = () => !disposed && root.isConnected;
  function cleanupEditor(){editorController?.dispose();editorController=null;}
  function open(html) { cleanupEditor();pickerCleanup?.(); pickerCleanup = null; show(html); }
  const observer=new MutationObserver(()=>{if(editorController&&!editorController.root.isConnected)cleanupEditor();});observer.observe(content,{childList:true,subtree:true});
  const sheet=content.closest('dialog');sheet?.addEventListener('cancel',event=>{if(editorController?.back()){event.preventDefault();event.stopImmediatePropagation();}},{capture:true,signal:events.signal});
  async function reload() {
    const id = ++serial;
    root.innerHTML = '<p class="empty">Loading…</p>';
    try {
      const result = await request('/api/repeats?' + new URLSearchParams({date: date()}));
      if (!alive() || id !== serial) return;
      data = result;
      render();return true;
    } catch (error) {
      if (alive() && id === serial) {
        root.innerHTML = `<p class="sheet-message" role="status">${e(error.message)}</p><button type="button" class="more-results">Try again</button>`;
        root.querySelector('button').onclick = reload;
      }
      return false;
    }
  }
  function render() {
    list?.dispose();
    if(headerRoot)headerRoot.innerHTML=mobileRepeatsHeader('en',icon);
    root.innerHTML=(headerRoot?'':mobileRepeatsHeader('en',icon))+mobileRepeatsMarkup({language:'en',rows:data.items,name:row=>row.name,quantity,icon,query})+'<p class="repeat-status sheet-message" role="status"></p>';
    list=new MobileRepeatList({root,language:'en',onQuery:value=>{query=value;}});
    const review=root.querySelector('[data-action=apply-repeats]');if(review){review.disabled=!data.preview.items.length||data.completed;if(data.completed)review.textContent='Day completed';}
  }
  function click(event){const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;if(action==='repeat-home')onExit?.();if(action==='new-repeat')chooseItem();if(action==='edit-repeat')editItem(data.items.find(row=>row.id===button.dataset.id));if(action==='apply-repeats')review();}
  root.addEventListener('click',click,{signal:events.signal});headerRoot?.addEventListener('click',click,{signal:events.signal});
  function chooseItem(existing, draft) {
    open(`${header('Repeat Item')}<div class="repeat-picker"></div>${existing || draft ? '<button type="button" class="more-results" data-back>Back</button>' : ''}`);
    if (existing || draft) content.querySelector('[data-back]').onclick = () => editItem(existing, draft);
    pickerCleanup = mountFoodPicker(content.querySelector('.repeat-picker'), {onPick: (kind, id) => editItem(existing, {...draft, foodId: undefined, recipeId: undefined, mealId: undefined, [kind + 'Id']: id, amount: 1, quantity: undefined, unit: undefined, portionId: undefined})});
  }
  async function editItem(existing, draft) {
    const value = draft ?? existing;
    if (!value) return chooseItem();
    const kind = value.recipeId ? 'recipe' : value.mealId ? 'meal' : 'food', id = value[kind + 'Id'];
    open(`${header('Repeat Item')}<p class="empty">Loading…</p>`);
    const loading = content.querySelector('.empty');
    try {
      const item = await request('/api/library/item?' + new URLSearchParams({kind, id}));
      if (disposed || !loading.isConnected) return;
      editor(existing, value, item);
    } catch (error) { if (!disposed && loading.isConnected) loading.textContent = error.message; }
  }
  function editor(existing, draft, item) {
    const value = {startDate: data.date, days: [0, 1, 2, 3, 4, 5, 6], time: new Date().toTimeString().slice(0, 5), group: data.groups.includes('Uncategorized') ? 'Uncategorized' : data.groups[0], enabled: true, ...draft};
    const fields='<div class="quantity-fields" data-quantity-fields>'+quantityFields(item.options,value).replace('name="amount"','name="amount" aria-label="Amount"').replace('name="unit"','name="unit" data-quantity-unit')+'</div>';
    open(mobileRepeatForm({language:'en',record:value,name:item.resource.name,reference:{[item.kind+'Id']:item.resource.id},quantity:fields,groupOptions:data.groups.map(group=>`<option value="${e(group)}" ${group===value.group?'selected':''}>${e(group)}</option>`).join(''),icon}));
    const form=content.querySelector('form'),revision=data.revision;form.querySelector('h2').id='sheet-title';form.elements.group.setAttribute('aria-label','Group');
    form.querySelector('.mr-footer').insertAdjacentHTML('beforebegin','<p class="repeat-status" role="status"></p>');
    const read=()=>({... (existing?{id:existing.id}:{}),[item.kind+'Id']:item.resource.id,...quantityValue(form),group:form.elements.group.value,time:form.querySelector('[data-mr-timestamp]').checked?form.elements.time.value:'',days:[...form.querySelectorAll('[name=days]:checked')].map(input=>Number(input.value)),startDate:form.elements.startDate.value,endDate:form.elements.endDate.value||null,enabled:value.enabled!==false});
    form.querySelector('[data-action=close-dialog]').onclick=()=>{cleanupEditor();close();};
    editorController=new MobileRepeatEditor({root:form,language:'en',record:value,resetQuantity:()=>{},readDraft:()=>value.enabled===false?value:read(),onError:error=>{form.querySelector('[role=status]').textContent=error.message;},onAction:async(action,actionDraft)=>{
      if(action==='delete'){
        const draft=actionDraft;open(`${header('Delete Repeat Item')}<div class="repeat-delete"><p class="repeat-date">${e(item.resource.name)}</p><p class="sheet-message" role="status"></p><div class="entry-actions"><button type="button" data-back>Cancel</button><button type="button" class="danger" data-confirm>Delete</button></div></div>`);
        const panel=content.querySelector('.repeat-delete');panel.querySelector('[data-back]').onclick=()=>editor(existing,draft,item);panel.querySelector('[data-confirm]').onclick=()=>save(panel,revision,'repeat.delete',{id:existing.id});return;
      }
      try{if(action!=='reload')await command(revision,'repeat.setEnabled',{id:existing.id,enabled:action==='enable'});await onChange();if(!await reload())throw Error('Unable to reload repeats. Try again.');if(form.isConnected){const current=data.items.find(row=>row.id===existing.id);if(current)editor(current,current,item);else close();}}
      catch(error){error.reloadRequired=error.status===409||!(error.status>=400&&error.status<500);throw error;}
    }});
    form.onsubmit=event=>{event.preventDefault();if(form.checkValidity())save(form,revision,'repeat.save',read());};
  }
  function review() {
    const preview = data.preview, revision = data.revision;
    open(`${header('Review Repeat Items')}<form class="entry-form"><p class="repeat-date">${e(preview.date)}</p>${preview.items.map(row => `<label class="repeat-review"><input type="checkbox" name="repeat" value="${e(row.id)}" checked><span><strong>${e(row.name)}</strong><small>${e(reviewQuantity(row.quantity))} · ${e(row.group)} · ${e(row.time ?? '')}</small><small>${num(row.nutrients.calories)} kcal</small></span></label>`).join('')}<p class="sheet-message" role="status"></p><footer class="entry-actions"><button class="primary">Add to diary</button></footer></form>`);
    const form = content.querySelector('form');
    form.onsubmit = event => {
      event.preventDefault();
      const ids = new Set([...form.querySelectorAll('[name=repeat]:checked')].map(input => input.value));
      save(form, revision, 'repeat.apply', {date: preview.date, items: preview.items.filter(row => ids.has(row.id)).map(({id, fingerprint}) => ({id, fingerprint}))});
    };
  }
  async function save(panel, revision, type, payload) {
    if(panel.dataset.saving)return;panel.dataset.saving='true';
    const controls=[...panel.querySelectorAll('input,select,button')].filter(el=>el.dataset.action!=='close-dialog');controls.forEach(el=>el.disabled=true);
    const status=panel.querySelector('[role=status]'),captured=structuredClone(payload);let committed=false;
    const run=async()=>{
      status.replaceChildren();
      try{if(!committed){await command(revision,type,captured);committed=true;}await onChange();if(panel.isConnected)close();if(alive())await reload();}
      catch(error){if(!panel.isConnected)return;status.textContent=error.message;const button=document.createElement('button');button.type='button';
        if(error.status===409){button.textContent='Reload repeats';button.onclick=()=>{cleanupEditor();close();reload();};}
        else if(!(error.status>=400&&error.status<500)||committed){button.textContent='Retry';button.onclick=run;}
        else{delete panel.dataset.saving;controls.forEach(el=>el.disabled=false);editorController?.refresh();return;}
        status.append(button);
      }
    };await run();
  }
  reload();
  return {reload,back(){return editorController?.back()??false;},dispose(){disposed=true;serial++;cleanupEditor();list?.dispose();pickerCleanup?.();observer.disconnect();events.abort();document.body.classList.remove('repeats-mobile');data=null;}};
}
