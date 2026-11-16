import {escape as e} from './discover-ui.js';
import {exerciseNavigation} from './exercise-navigation.js';
import {createExerciseSearch} from './exercise-search.mjs';
let catalogue=null,pending=null;
const icon=name=>`<img src="/record-source/exercise-icons/${name}.svg" alt="" aria-hidden="true">`;
export class MobileExerciseBrowser{
 constructor({root,dialog,api,message,snapshot={node:'root',query:'',parent:null},onNavigate,onSelect,onCustom}){
  Object.assign(this,{root,dialog,api,message,snapshot:{...snapshot},onNavigate,onSelect,onCustom});this.abort=new AbortController();this.disposed=false;dialog.classList.add('mobile-food-editor','mobile-catalog-browser');root.classList.add('mcb-content');
  if(snapshot.parent)dialog.querySelector('[data-action=close-dialog]').innerHTML=icon('chevron-left');
  if(snapshot.node==='root')dialog.querySelector('.dialog-head').insertAdjacentHTML('beforeend',`<label class="mcb-search">${icon('magnify')}<input type="search" data-meb-search value="${e(snapshot.query)}" placeholder="${e(message('search'))}" aria-label="${e(message('search'))}"></label>`);
  dialog.addEventListener('input',event=>{if(event.target.matches('[data-meb-search]')){this.snapshot.query=event.target.value;this.render()}},{signal:this.abort.signal});
  root.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-meb-custom'))return onCustom(this.snapshot);if(button.hasAttribute('data-meb-retry'))return this.load();if(button.dataset.mebNode){const node=this.navigation.node(button.dataset.mebNode);if(node.instant)return onSelect(node.activities[0],node.activities,node.id,this.snapshot);return onNavigate({node:node.id,query:'',parent:{...this.snapshot}})}if(button.dataset.mebCode){const row=this.catalogue.items.find(row=>row.code===button.dataset.mebCode);if(row)onSelect(row,this.snapshot.node==='root'?[row]:this.navigation.node(this.snapshot.node).activities,null,this.snapshot)}},{signal:this.abort.signal});
  if(catalogue)this.ready(catalogue);else this.load();
 }
 async load(){this.root.innerHTML=`<p class="mcb-status" role="status">${e(this.message('loading'))}</p>`;try{pending??=this.api('/api/exercise-catalog');const result=await pending;if(!result)throw Error('Catalogue unavailable');catalogue=result;if(!this.disposed)this.ready(result)}catch{pending=null;if(!this.disposed)this.root.innerHTML=`<p class="mcb-status" role="alert">${e(this.message('unavailable'))}</p><button type="button" data-meb-retry>${e(this.message('retry'))}</button>`}}
 ready(result){this.catalogue=result;this.navigation=exerciseNavigation(result.items);this.search=createExerciseSearch(result.items,result.headings);this.render()}
 render(){if(!this.catalogue)return;const m=this.message,node=this.navigation.node(this.snapshot.node),query=this.snapshot.query.trim(),rows=query?this.search(query):node.activities;
  this.root.innerHTML=(!query&&node.children?`<div class="mcb-grid">${node.children.map(child=>`<button type="button" data-meb-node="${child.id}">${icon(child.icon)}<span>${e(m(child.id))}</span></button>`).join('')}</div>`:`<div class="mcb-results">${rows.length?rows.map(row=>`<button type="button" data-meb-code="${row.code}">${e(row.description)}</button>`).join(''):`<p role="status">${e(m('noResults'))}</p>`}</div>`)+(this.snapshot.node==='root'?`<div class="mcb-footer"><button type="button" data-meb-custom>+ ${e(m('custom'))}</button></div>`:'');
 }
 dispose(){this.disposed=true;this.abort.abort()}
}
