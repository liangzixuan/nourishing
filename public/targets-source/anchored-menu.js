/** Use a modal when the outside tap must only dismiss the menu. */
export class AnchoredMenu{
  constructor({items,label,heading,modal=false,origin,x,y,anchor=null,bounds=null,placement='anchor',className='',onChoose,onClose}){
    Object.assign(this,{origin,onChoose,onClose});this.closed=false;
    const root=document.createElement(modal?'dialog':'div');this.root=root;root.className='anchored-menu '+className;
    if(!modal)root.setAttribute('popover','auto');
    root.setAttribute('role','menu');root.setAttribute('aria-label',label);
    if(heading){const text=document.createElement('div');text.className='menu-heading';text.textContent=heading;root.append(text);}
    for(const item of items){
      const button=document.createElement('button');button.type='button';
      button.setAttribute('role',item.selected===undefined?'menuitem':'menuitemradio');
      if(item.selected!==undefined)button.setAttribute('aria-checked',String(item.selected));
      if(item.description){
        const name=document.createElement('strong'),description=document.createElement('span');
        name.textContent=item.label;description.textContent=item.description;button.append(name,description);
      }else button.textContent=item.label;
      if(item.icon){const image=document.createElement('img');image.src=item.icon;image.alt='';button.prepend(image);}
      button.dataset.menuCommand=item.id;button.disabled=Boolean(item.disabled);button.tabIndex=-1;root.append(button);
    }
    root.addEventListener('click',event=>{const button=event.target.closest('[data-menu-command]');if(!button||button.disabled)return;const id=button.dataset.menuCommand;this.close();onChoose(id);});
    root.addEventListener('keydown',event=>{
      const buttons=[...root.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close();}
      if(event.key==='Tab'){event.preventDefault();this.close();}
    });
    if(modal){
      root.addEventListener('cancel',event=>{event.preventDefault();this.close();});
      root.addEventListener('click',event=>{
        if(event.target!==root)return;
        const rect=root.getBoundingClientRect();
        if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)this.close();
      });
    }else root.addEventListener('toggle',event=>{if(event.newState==='closed')this.close(false);});
    this.resize=()=>this.close(false);
    window.addEventListener('resize',this.resize);
    const host=origin?.closest('dialog')||document.body;host.append(root);
    const minTop=Math.max(8,bounds?.top??8,anchor?host.querySelector(':scope>.dialog-head')?.getBoundingClientRect().bottom??8:8),maxBottom=Math.min(innerHeight-8,bounds?.bottom??innerHeight-8);
    if(anchor)root.style.maxHeight=Math.max(44,maxBottom-minTop)+'px';
    if(modal)root.showModal();else root.showPopover();const rect=root.getBoundingClientRect(),anchorRect=anchor?.getBoundingClientRect();
    if(placement==='bottom'){root.style.left=Math.max(0,(innerWidth-rect.width)/2)+'px';root.style.top=Math.max(0,Math.min(innerHeight,bounds?.bottom??innerHeight)-rect.height)+'px';}else{root.style.left=Math.max(8,Math.min(anchorRect?anchorRect.right-rect.width:x,innerWidth-rect.width-8))+'px';root.style.top=Math.max(minTop,Math.min(anchorRect?anchorRect.bottom:y,maxBottom-rect.height))+'px';}
    const selected=[...root.querySelectorAll('[aria-checked=true]')].find(button=>button.dataset.menuCommand!=='');(selected||root.querySelector('button:not(:disabled)'))?.focus(bounds?{preventScroll:true}:undefined);if(bounds&&selected&&root.scrollHeight>root.clientHeight)root.scrollTop=selected.offsetTop-(root.clientHeight-selected.offsetHeight)/2;
  }
  close(restoreFocus=true){if(this.closed)return;this.closed=true;window.removeEventListener('resize',this.resize);if(this.root.open)this.root.close();else if(this.root.matches(':popover-open'))this.root.hidePopover();this.root.remove();if(restoreFocus&&this.origin?.isConnected)this.origin.focus();this.onClose?.();}
}
