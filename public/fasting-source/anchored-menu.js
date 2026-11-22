/** A short-lived native popover owns focus, dismissal and keyboard navigation. */
export class AnchoredMenu{
  constructor({items,label,origin,x,y,anchor=null,bounds=null,placement='anchor',edgeInset=8,className='',onChoose,onClose,searchable=false}){
    Object.assign(this,{origin,onChoose,onClose});this.closed=false;
    const root=document.createElement('div');this.root=root;root.className='anchored-menu '+className;root.setAttribute('popover','auto');root.setAttribute('role','menu');root.setAttribute('aria-label',label);
    for(const item of items){const button=document.createElement('button');button.type='button';button.setAttribute('role',item.selected===undefined?'menuitem':'menuitemradio');if(item.selected!==undefined)button.setAttribute('aria-checked',String(item.selected));button.textContent=item.label;if(item.icon){const image=document.createElement('img');image.src=item.icon;image.alt='';button.prepend(image);}button.dataset.menuCommand=item.id;button.disabled=Boolean(item.disabled);button.tabIndex=-1;root.append(button);}
    if(searchable){const input=document.createElement('input');input.type='search';input.placeholder='Search nutrients';input.setAttribute('aria-label','Search nutrients');input.addEventListener('input',()=>{const query=input.value.trim().toLocaleLowerCase();for(const button of root.querySelectorAll('[data-menu-command]'))button.hidden=!button.textContent.toLocaleLowerCase().includes(query);});root.prepend(input);}
    root.addEventListener('click',event=>{const button=event.target.closest('[data-menu-command]');if(!button||button.disabled)return;const id=button.dataset.menuCommand;this.close();onChoose(id);});
    root.addEventListener('keydown',event=>{
      const buttons=[...root.querySelectorAll('button:not(:disabled):not([hidden])')],index=buttons.indexOf(document.activeElement);
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close();}
      if(event.key==='Tab'){event.preventDefault();this.close();}
    });
    root.addEventListener('toggle',event=>{if(event.newState==='closed')this.close(false);});
    this.resize=()=>this.close(false);
    window.addEventListener('resize',this.resize);
    const host=origin?.closest('dialog')||document.body;host.append(root);
    const minTop=Math.max(edgeInset,bounds?.top??edgeInset,anchor?host.querySelector(':scope>.dialog-head')?.getBoundingClientRect().bottom??edgeInset:edgeInset),maxBottom=Math.min(innerHeight-edgeInset,bounds?.bottom??innerHeight-edgeInset);
    if(anchor)root.style.maxHeight=Math.max(44,maxBottom-minTop)+'px';
    root.showPopover();const rect=root.getBoundingClientRect(),anchorRect=anchor?.getBoundingClientRect();
    if(placement==='bottom'){root.style.left=Math.max(0,(innerWidth-rect.width)/2)+'px';root.style.top=Math.max(0,innerHeight-rect.height)+'px';}else if(placement==='row-end'&&anchorRect){
      root.style.left=Math.max(0,Math.min(innerWidth,anchorRect.right)-rect.width)+'px';
      root.style.top=Math.max(minTop,Math.min(anchorRect.bottom-16,maxBottom-rect.height))+'px';
    }else{root.style.left=Math.max(edgeInset,Math.min(anchorRect?anchorRect.right-rect.width:x,innerWidth-rect.width-edgeInset))+'px';root.style.top=Math.max(minTop,Math.min(y??anchorRect?.bottom??minTop,maxBottom-rect.height))+'px';}
    const selected=[...root.querySelectorAll('[aria-checked=true]')].find(button=>button.dataset.menuCommand!=='');(selected||root.querySelector('button:not(:disabled)'))?.focus(bounds?{preventScroll:true}:undefined);if(bounds&&selected&&root.scrollHeight>root.clientHeight)root.scrollTop=selected.offsetTop-(root.clientHeight-selected.offsetHeight)/2;
  }
  close(restoreFocus=true){if(this.closed)return;this.closed=true;window.removeEventListener('resize',this.resize);if(this.root.matches(':popover-open'))this.root.hidePopover();this.root.remove();if(restoreFocus&&this.origin?.isConnected)this.origin.focus();this.onClose?.();}
}
