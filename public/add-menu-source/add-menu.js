import {addMenuActions,addMenuColors,parseAddMenu} from './add-menu.mjs';
import {escape as e,symbol} from '../dashboard-source/discover-ui.js';
import {coreText} from '../core-cloud-messages.js';

import {AnchoredMenu} from '../targets-source/anchored-menu.js';

const groupOrder=['food','barcode','photo','voice','exercise','biometric','note','suggest'];

export function openGroupAddMenu(origin,event,onChoose){
 const rect=origin.getBoundingClientRect();
 const navTop=document.querySelector('.app-nav').getBoundingClientRect().top;
 const items=groupOrder.map(id=>({
  id,label:coreText('add.'+id),glyph:addMenuActions.find(action=>action.id===id).icon,
 }));
 return new AnchoredMenu({
  origin,items,onChoose,modal:true,className:'am-group',label:coreText('add.title'),
  x:event.detail?event.clientX:rect.left+rect.width/2,
  y:event.detail?event.clientY:rect.top+rect.height/2,
  bounds:{bottom:navTop>0?navTop-8:innerHeight-8},
 });
}

export class AddMenu {
 constructor({preferences,onSelect,onSave,includeFast=true}) {
  this.available=id=>includeFast||id!=='fast';
  this.saved=parseAddMenu(preferences);this.value=structuredClone(this.saved);this.onSelect=onSelect;this.onSave=onSave;this.editing=false;this.busy=false;
  this.trigger=document.activeElement;this.nativeBack=event=>{event.preventDefault();this.back();};window.addEventListener('nourishing-back',this.nativeBack,true);
  this.dialog=document.createElement('dialog');this.dialog.className='am-sheet';this.dialog.setAttribute('aria-label',coreText('add.title'));
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
 visible(){return this.value.order.filter(id=>this.available(id)&&!this.value.hidden.includes(id));}
 action(id){const value=addMenuActions.find(x=>x.id===id);return {...value,label:coreText('add.'+id)};}
 render(){
  const visible=this.visible();
  const hidden=this.value.hidden.filter(this.available);
  const primary=visible.filter(id=>this.action(id).color),secondary=visible.filter(id=>!this.action(id).color);
  const item=(id,tile)=>{const a=this.action(id),label=key=>e(coreText('add.'+key,{name:a.label}));return `<div class="am-item ${tile?'am-tile':'am-row'}" data-item="${id}"><button type="button" class="am-action" data-am="${this.editing?'color':'select'}" data-id="${id}" aria-label="${this.editing?label('colorFor'):e(a.label)}"><span class="am-icon" data-am-color="${this.value.colors[id]??a.color??'#3e4152'}">${symbol(a.icon)}</span><span class="am-label">${tile?e(a.label).replace(/ (?!.* )/,"<br>"):e(a.label)}</span></button>${this.editing?`<button type="button" class="am-remove" data-am="hide" data-id="${id}" aria-label="${label('hide')}"></button><span class="am-order"><button type="button" data-am="earlier" data-id="${id}" aria-label="${label('earlier')}">${symbol('chevron_left')}</button><button type="button" data-am="later" data-id="${id}" aria-label="${label('later')}">${symbol('chevron_right')}</button></span>`:''}</div>`;};
  const tiles=`<div class="am-tiles">${primary.map(id=>item(id,true)).join('')}</div>`,rows=`<div class="am-rows">${secondary.map(id=>item(id,false)).join('')}</div>`;
  this.dialog.innerHTML=`<header ${this.palette?'inert':''}><h2>${e(coreText('add.title'))}</h2><button type="button" data-am="${this.editing?'done':'edit'}" ${this.busy?'disabled':''}>${e(coreText(this.editing?'add.done':'add.edit'))}</button></header><div class="am-body" ${this.palette?'inert':''}>${this.editing&&!this.hintDismissed?`<div class="am-hint"><span>${e(coreText('add.hint'))}</span><button type="button" data-am="dismiss-hint" aria-label="${e(coreText('add.dismissHint'))}">&times;</button></div>`:''}${this.value.swapped?rows+tiles:tiles+rows}${this.editing?`<button type="button" class="am-swap" data-am="swap">${symbol('sync')} ${e(coreText('add.swap'))}</button>${hidden.length?`<div class="am-hidden">${hidden.map(id=>`<button type="button" data-am="restore" data-id="${id}">${symbol('add_circle')} ${e(this.action(id).label)}</button>`).join('')}</div>`:''}`:''}<p role="alert" class="am-error">${e(this.error??'')}</p></div>${this.palette?`<div class="am-palette-backdrop"><section class="am-palette" aria-label="${e(coreText('add.chooseColor'))}"><h3>${e(coreText('add.chooseColor'))}</h3><div>${addMenuColors.map(color=>`<button type="button" data-am="pick" data-color="${color}" data-am-color="${color}" aria-label="${e(coreText('add.color',{color}))}" aria-pressed="${this.value.colors[this.palette]===color}"></button>`).join('')}</div><button type="button" data-am="palette-close">${e(coreText('add.done'))}</button></section></div>`:''}`;
 }
 async click(event){
  if(this.suppressClick){this.suppressClick=false;return;}
  if(event.target===this.dialog){const r=this.dialog.getBoundingClientRect();if(event.clientY<r.top||event.clientY>r.bottom||event.clientX<r.left||event.clientX>r.right)this.back();return;}
  if(event.target.classList.contains('am-palette-backdrop')){this.palette=null;this.render();return;}
  const button=event.target.closest('[data-am]');if(!button||this.busy)return;const {am,id,color}=button.dataset;this.error=null;
  if(am==='select'){this.close();this.onSelect(id);return;}
  if(am==='edit')this.editing=true;
  if(am==='dismiss-hint')this.hintDismissed=true;
  if(am==='color')this.palette=id;
  if(am==='palette-close')this.palette=null;
  if(am==='pick'){this.value.colors[this.palette]=color;this.palette=null;}
  if(am==='swap')this.value.swapped=!this.value.swapped;
  if(am==='hide'){if(this.visible().length<=1)this.error=coreText('add.keepOne');else this.value.hidden.push(id);}
  if(am==='restore')this.value.hidden=this.value.hidden.filter(x=>x!==id);
  if(am==='earlier'||am==='later'){const group=this.visible().filter(x=>!!this.action(x).color===!!this.action(id).color),next=group[group.indexOf(id)+(am==='earlier'?-1:1)];if(next)this.move(id,next);}
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
