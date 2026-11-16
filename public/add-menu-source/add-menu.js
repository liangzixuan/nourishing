import {addMenuActions,addMenuColors,parseAddMenu} from './add-menu.mjs';
import {escape as e,symbol} from '../dashboard-source/discover-ui.js';

export class AddMenu {
 constructor({preferences,onSelect,onSave}) {
  this.saved=parseAddMenu(preferences);this.value=structuredClone(this.saved);this.onSelect=onSelect;this.onSave=onSave;this.editing=false;this.busy=false;
  this.trigger=document.activeElement;this.nativeBack=event=>{event.preventDefault();this.back();};window.addEventListener('nourishing-back',this.nativeBack,true);
  this.dialog=document.createElement('dialog');this.dialog.className='am-sheet';this.dialog.setAttribute('aria-label','Add to Diary');
  this.dialog.addEventListener('click',event=>this.click(event));
  this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.back();});
  this.dialog.addEventListener('close',()=>this.dispose());
  this.dialog.addEventListener('pointerdown',event=>this.pointerDown(event));
  this.dialog.addEventListener('pointermove',event=>this.pointerMove(event));
  this.dialog.addEventListener('pointerup',event=>this.pointerUp(event));
  this.dialog.addEventListener('pointercancel',()=>this.cancelDrag());
  document.body.append(this.dialog);this.render();this.dialog.showModal();
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.cancelDrag();window.removeEventListener('nourishing-back',this.nativeBack,true);this.dialog.remove();if(this.trigger?.isConnected)this.trigger.focus();}
 close(){if(!this.busy){this.dialog.close();this.dispose();}}
 back(){if(this.busy)return;if(this.palette){this.palette=null;this.render();}else if(this.editing){this.editing=false;this.value=structuredClone(this.saved);this.render();}else this.close();}
 action(id){return addMenuActions.find(x=>x.id===id);}
 render(){
  const visible=this.value.order.filter(id=>!this.value.hidden.includes(id));
  const primary=visible.filter(id=>this.action(id).color),secondary=visible.filter(id=>!this.action(id).color);
  const item=(id,tile)=>{const a=this.action(id);return `<div class="am-item ${tile?'am-tile':'am-row'}" data-item="${id}"><button type="button" class="am-action" data-am="${this.editing?'color':'select'}" data-id="${id}" aria-label="${e(this.editing?'Color for '+a.label:a.label)}"><span class="am-icon" data-am-color="${this.value.colors[id]??a.color??'#3e4152'}">${symbol(a.icon)}</span><span class="am-label">${tile?e(a.label).replace(/ (?!.* )/,"<br>"):e(a.label)}</span></button>${this.editing?`<button type="button" class="am-remove" data-am="hide" data-id="${id}" aria-label="Hide ${e(a.label)}">${symbol('remove_circle')}</button><span class="am-order"><button type="button" data-am="earlier" data-id="${id}" aria-label="Move ${e(a.label)} earlier">${symbol('chevron_left')}</button><button type="button" data-am="later" data-id="${id}" aria-label="Move ${e(a.label)} later">${symbol('chevron_right')}</button></span>`:''}</div>`;};
  const tiles=`<div class="am-tiles">${primary.map(id=>item(id,true)).join('')}</div>`,rows=`<div class="am-rows">${secondary.map(id=>item(id,false)).join('')}</div>`;
  this.dialog.innerHTML=`<header ${this.palette?'inert':''}><h2>Add to Diary</h2><button type="button" data-am="${this.editing?'done':'edit'}" ${this.busy?'disabled':''}>${this.editing?'DONE':'EDIT MENU'}</button></header><div class="am-body" ${this.palette?'inert':''}>${this.editing?'<p class="am-hint">Hold to reorder · Tap an icon for color</p>':''}${this.value.swapped?rows+tiles:tiles+rows}${this.editing?`<button type="button" class="am-swap" data-am="swap">${symbol('sync')} SWAP TOP &amp; BOTTOM SECTIONS</button>${this.value.hidden.length?`<div class="am-hidden">${this.value.hidden.map(id=>`<button type="button" data-am="restore" data-id="${id}">${symbol('add_circle')} ${e(this.action(id).label)}</button>`).join('')}</div>`:''}`:''}<p role="alert" class="am-error">${e(this.error??'')}</p></div>${this.palette?`<div class="am-palette-backdrop"><section class="am-palette" aria-label="Choose shortcut color"><h3>Choose Color</h3><div>${addMenuColors.map(color=>`<button type="button" data-am="pick" data-color="${color}" data-am-color="${color}" aria-label="Color ${color}" aria-pressed="${this.value.colors[this.palette]===color}"></button>`).join('')}</div><button type="button" data-am="palette-close">DONE</button></section></div>`:''}`;
 }
 async click(event){
  if(this.suppressClick){this.suppressClick=false;return;}
  if(event.target===this.dialog){const r=this.dialog.getBoundingClientRect();if(event.clientY<r.top||event.clientY>r.bottom||event.clientX<r.left||event.clientX>r.right)this.back();return;}
  if(event.target.classList.contains('am-palette-backdrop')){this.palette=null;this.render();return;}
  const button=event.target.closest('[data-am]');if(!button||this.busy)return;const {am,id,color}=button.dataset;this.error=null;
  if(am==='select'){this.close();this.onSelect(id);return;}
  if(am==='edit')this.editing=true;
  if(am==='color')this.palette=id;
  if(am==='palette-close')this.palette=null;
  if(am==='pick'){this.value.colors[this.palette]=color;this.palette=null;}
  if(am==='swap')this.value.swapped=!this.value.swapped;
  if(am==='hide'){if(this.value.hidden.length===addMenuActions.length-1)this.error='Keep at least one action.';else this.value.hidden.push(id);}
  if(am==='restore')this.value.hidden=this.value.hidden.filter(x=>x!==id);
  if(am==='earlier'||am==='later'){const group=this.value.order.filter(x=>!this.value.hidden.includes(x)&&!!this.action(x).color===!!this.action(id).color),next=group[group.indexOf(id)+(am==='earlier'?-1:1)];if(next)this.move(id,next);}
  if(am==='done'){
   this.busy=true;this.render();
   try{const value=parseAddMenu(this.value);await this.onSave(value);this.saved=structuredClone(value);this.editing=false;}catch(error){this.error=error.message;}finally{this.busy=false;}
  }
  this.render();
 }
 move(id,target){const order=this.value.order,a=order.indexOf(id),b=order.indexOf(target);order.splice(a,1);order.splice(b,0,id);}
 pointerDown(event){
  if(!this.editing||this.busy||this.palette||!event.target.closest('.am-icon'))return;const item=event.target.closest('[data-item]');if(!item)return;
  this.press={id:item.dataset.item,x:event.clientX,y:event.clientY,pointer:event.pointerId};
  this.hold=setTimeout(()=>{this.drag=this.press;item.classList.add('am-dragging');this.dialog.setPointerCapture(event.pointerId);},450);
 }
 pointerMove(event){if(!this.press)return;if(!this.drag&&Math.hypot(event.clientX-this.press.x,event.clientY-this.press.y)>12)this.cancelDrag();if(this.drag)event.preventDefault();}
 pointerUp(event){if(this.drag){const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-item]')?.dataset.item;if(target&&!!this.action(target).color===!!this.action(this.drag.id).color)this.move(this.drag.id,target);this.suppressClick=true;setTimeout(()=>{this.suppressClick=false;},0);this.cancelDrag();this.render();}else this.cancelDrag();}
 cancelDrag(){clearTimeout(this.hold);if(this.press&&this.dialog.hasPointerCapture(this.press.pointer))this.dialog.releasePointerCapture(this.press.pointer);this.press=null;this.drag=null;}
}
