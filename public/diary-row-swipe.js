/** Owns row gestures only. Existing Diary actions own edits and deletion. */
export function bindDiaryRowSwipe(root){
 const controller=new AbortController(),options={signal:controller.signal},document=root.ownerDocument;
 let gesture=null,opened=null,suppressed=null;
 function paint(row,offset){
  row.style.setProperty('--md-swipe-offset',offset+'px');
  row.style.setProperty('--md-swipe-reveal',Math.abs(offset)+'px');
  const menu=row.querySelector('.md-swipe-options');
  // Group menus keep a keyboard focus target when the touch action is closed.
  if(!menu.hasAttribute('data-tool-group'))menu.hidden=offset<=0;
  const remove=row.querySelector('.md-swipe-delete');if(remove)remove.hidden=offset>=0;
 }
 function close(){if(opened){paint(opened,0);opened.classList.remove('is-swiping');opened=null;}}
 function cancel(){gesture=null;close();}
 document.addEventListener('pointerdown',event=>{
  suppressed=null;
  if(!event.isPrimary||event.button!==0){cancel();return;}
  const row=event.target.closest('[data-md-swipable]');
  if(!row||!root.contains(row)){cancel();return;}
  if(event.target.closest('[data-md-swipe-action]'))return;
  if(document.activeElement?.matches('.diary-group-tools'))document.activeElement.blur();
  const offset=row===opened?Number.parseFloat(row.style.getPropertyValue('--md-swipe-offset'))||0:0;
  close();paint(row,offset);opened=row;
  gesture={row,touchStart:event.pointerType==='touch'?event.timeStamp:null,id:event.pointerId,x:event.clientX,y:event.clientY,offset,width:row.getBoundingClientRect().width*.2,horizontal:false};
 },options);
 document.addEventListener('pointermove',event=>{
  if(!gesture||event.pointerId!==gesture.id)return;
  const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
  if(!gesture.horizontal){
   if(Math.max(Math.abs(dx),Math.abs(dy))<10)return;
   if(Math.abs(dx)<=Math.abs(dy)*1.5){cancel();return;}
   gesture.horizontal=true;gesture.row.classList.add('is-swiping');gesture.row.setPointerCapture(event.pointerId);
  }
  event.preventDefault();
  const minimum=gesture.row.querySelector('.md-swipe-delete')?-gesture.width:0;
  paint(gesture.row,Math.max(minimum,Math.min(gesture.width,gesture.offset+dx)));
 },{...options,passive:false});
 document.addEventListener('pointerup',event=>{
  if(!gesture||event.pointerId!==gesture.id)return;
  const done=gesture;gesture=null;
  if(!done.horizontal){
   if(done.touchStart!==null&&event.timeStamp-done.touchStart>=500)suppressed={row:done.row,until:performance.now()+500};
   return;
  }
  done.row.classList.remove('is-swiping');
  const offset=Number.parseFloat(done.row.style.getPropertyValue('--md-swipe-offset'))||0;
  if(Math.abs(offset)>=done.width*.4)paint(done.row,Math.sign(offset)*done.width);else close();
  suppressed={row:done.row,until:performance.now()+500};
 },options);
 document.addEventListener('pointercancel',cancel,options);
 document.addEventListener('click',event=>{
  const action=event.target.closest('[data-md-swipe-action]');
  if(!action&&suppressed&&performance.now()<suppressed.until&&suppressed.row.contains(event.target)){
   event.preventDefault();event.stopImmediatePropagation();suppressed=null;return;
  }
  suppressed=null;if(opened)close();
 },{...options,capture:true});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')cancel();},options);
 return ()=>{cancel();controller.abort();};
}
