// Only gestures that start in the outer 24 CSS pixels belong to the app shell.
// The OS can consume a system edge gesture before the page receives any events.
export function navigationEdge(x,width){
 if(x<=24)return 'left';
 if(x>=width-24)return 'right';
 return null;
}

export function bindEdgeNavigation({inside,back}){
 let gesture=null;
 const cancel=()=>{gesture=null;};
 window.addEventListener('touchstart',event=>{
  cancel();
  if(event.touches.length!==1)return;
  const touch=event.touches[0],edge=navigationEdge(touch.clientX,innerWidth);
  if(edge&&inside())gesture={edge,id:touch.identifier,x:touch.clientX,y:touch.clientY};
 },{capture:true,passive:true});
 function travel(touch){
  const inward=(touch.clientX-gesture.x)*(gesture.edge==='left'?1:-1);
  return {inward,vertical:Math.abs(touch.clientY-gesture.y)};
 }
 window.addEventListener('touchmove',event=>{
  if(!gesture)return;
  const touch=event.touches[0];
  if(event.touches.length!==1||touch.identifier!==gesture.id)return cancel();
  const {inward,vertical}=travel(touch);
  if(Math.max(Math.abs(inward),vertical)<10)return;
  if(inward<=1.5*vertical)return cancel();
  if(event.cancelable)event.preventDefault();
 },{capture:true,passive:false});
 window.addEventListener('touchend',event=>{
  if(!gesture)return;
  const touch=Array.from(event.changedTouches).find(touch=>touch.identifier===gesture.id);
  if(!touch||event.touches.length)return cancel();
  const {inward,vertical}=travel(touch);
  cancel();
  if(inward<64||inward<=vertical*1.5)return;
  if(!inside())return;
  if(event.cancelable)event.preventDefault();
  event.stopPropagation();
  back();
 },{capture:true,passive:false});
 window.addEventListener('touchcancel',cancel,{capture:true,passive:true});
}

// A forgiving selector list keeps dialogs available on engines without popovers.
const openPopover=':is(:popover-open)';

// Hit testing resolves modal opening order. Some engines return the document
// when the coordinate lands on a backdrop, so also check the focused dialog.
export function activeOverlay(){
 const dialog=document.elementFromPoint(1,1)?.closest('dialog[open]')
  ??document.activeElement?.closest('dialog[open]')
  ??Array.from(document.querySelectorAll('dialog[open]')).at(-1);
 const popovers=(dialog??document).querySelectorAll(openPopover);
 return Array.from(popovers).at(-1)??dialog;
}

// Editors retain the shared sheet while an in-flight save needs their controls.
export function guardSheetExit(root,blocked,signal){
 root.closest('dialog')?.addEventListener('nourishing-before-exit',event=>{
  if(root.isConnected&&blocked())event.preventDefault();
 },{signal});
}

export function dismissOverlay(overlay){
 if(overlay.matches(openPopover)){overlay.hidePopover();return;}
 const cancel=new CustomEvent('cancel',{cancelable:true,detail:{destination:'back'}});
 if(overlay.dispatchEvent(cancel)&&overlay.open)overlay.close();
}
