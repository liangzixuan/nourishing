import {escape as e} from '../html.js';
// Standard chart menus stay inside the chart's fixed header and navigation.
function positionChartMenu(dialog,anchor) {
 const detail=anchor.closest('.chart-detail');
 const header=detail.querySelector('.sheet-header'),nav=detail.querySelector('.dc-bottom');
 const place=()=>{
  const top=header.getBoundingClientRect().bottom,bottom=nav.getBoundingClientRect().top;
  dialog.style.maxHeight=Math.max(0,bottom-top)+'px';
  const height=dialog.getBoundingClientRect().height;
  dialog.style.top=Math.max(top,Math.min(anchor.getBoundingClientRect().bottom-16,bottom-height))+'px';
  const current=dialog.querySelector('[aria-current=true]');
  if(current)dialog.scrollTop=current.offsetTop-(dialog.clientHeight-current.offsetHeight)/2;
 };
 place();
 const observer=new ResizeObserver(place);
 for(const element of [detail.closest('dialog'),header,nav])observer.observe(element);
 return observer;
}
/** A chart child popup owns only its draft and dismissal, never persistence. */
export class MobileChartPicker {
 constructor({label,choices,selected,search,anchor,onChoose,onClose,confirm,content,closeLabel,presentation='menu'}){
  Object.assign(this,{choices,selected,onChoose,onClose});this.focus=document.activeElement;this.dialog=document.createElement('dialog');this.dialog.className='mcp-picker'+(presentation==='sheet'?' mcp-sheet':presentation==='chart-control'?' mcp-chart-control':'');this.dialog.setAttribute('aria-label',label);
  this.dialog.innerHTML=content&&presentation==='sheet'?`<header><button type="button" data-mcp-cancel aria-label="${e(closeLabel)}"><span aria-hidden="true">×</span></button><h2>${e(label)}</h2></header><div class="mcp-content">${content}</div>`:content?`<h2>${e(label)}</h2><div class="mcp-content">${content}</div><footer><button type="button" data-mcp-cancel>${e(closeLabel)}</button></footer>`:confirm?`<h2>${e(label)}</h2><p>${e(confirm.message)}</p><footer><button type="button" data-mcp-cancel>${e(confirm.cancel)}</button><button type="button" data-mcp-confirm>${e(confirm.accept)}</button></footer>`:`${search?`<input type="search" data-mcp-search aria-label="${e(search)}" placeholder="${e(search)}">`:''}<div data-mcp-choices></div>`;
  const render=()=>{const term=(this.dialog.querySelector('input')?.value??'').toLocaleLowerCase();this.dialog.querySelector('[data-mcp-choices]').innerHTML=choices.filter(row=>row.label.toLocaleLowerCase().includes(term)).map(row=>`<button type="button" data-mcp-choice="${e(row.value)}" aria-current="${row.value===selected}">${e(row.label)}</button>`).join('')};if(!confirm&&!content)render();
  this.dialog.addEventListener('input',render);this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.close()});
  if(presentation==='chart-control'){
   let backdropTouch=false;
   this.dialog.addEventListener('touchstart',event=>{
    const touch=event.touches[0],rect=this.dialog.getBoundingClientRect();
    backdropTouch=event.touches.length===1&&event.target===this.dialog&&(touch.clientX<rect.left||touch.clientX>rect.right||touch.clientY<rect.top||touch.clientY>rect.bottom);
   });
   this.dialog.addEventListener('touchmove',event=>{if(backdropTouch)event.preventDefault();},{passive:false});
   this.dialog.addEventListener('touchend',event=>{if(backdropTouch){event.preventDefault();this.close();}},{passive:false});
   this.dialog.addEventListener('touchcancel',()=>{backdropTouch=false;});
  }
  this.dialog.addEventListener('click',event=>{const button=event.target.closest('button');if(button?.hasAttribute('data-mcp-choice')){const value=button.dataset.mcpChoice;this.close();void onChoose(value)}else if(button?.hasAttribute('data-mcp-confirm')){this.close();void onChoose(true)}else if(button?.hasAttribute('data-mcp-cancel'))this.close();else if(event.target===this.dialog){const box=this.dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)this.close()}});
  document.body.append(this.dialog);this.dialog.showModal();
  if(anchor&&presentation==='chart-control')this.positionObserver=positionChartMenu(this.dialog,anchor);
  else if(anchor&&!confirm){const rect=anchor.getBoundingClientRect(),height=this.dialog.getBoundingClientRect().height;this.dialog.style.top=Math.max(12,Math.min(rect.top,innerHeight-height-80))+'px';this.dialog.style.right='8px';this.dialog.style.left='auto';this.dialog.style.margin='0';}
  const current=presentation==='chart-control'&&this.dialog.querySelector('[aria-current=true]');
  (current||this.dialog.querySelector('input,[aria-current=true],button'))?.focus({preventScroll:true});
 }
 close(){if(this.closed)return;this.closed=true;this.positionObserver?.disconnect();this.dialog.close();this.dialog.remove();if(this.focus?.isConnected)this.focus.focus({preventScroll:true});this.onClose?.()}
}
