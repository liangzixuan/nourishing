import {navigationEdge} from './edge-navigation.js';
const tabs=['dashboard','charts','report','snapshots'];
// Taps still activate cards, charts and headings; horizontal intent owns a swipe.
const controls='input,select,textarea,[contenteditable]:not([contenteditable="false"]),[role="slider"],[data-discover-swipe-ignore]';

/** A touch gesture owns navigation only after horizontal intent within Discover. */
export function bindDiscoverSwipe(root,{current,select,onMove=()=>{},onCancel=()=>{},isTransitioning=()=>false}){
 let gesture=null;const surface=root.ownerDocument;
 const blocked=()=>!root.isConnected||root.ownerDocument.querySelector('dialog[open],[aria-modal="true"]')!==null;
 function eligible(target){
  if(!(target instanceof Element)||target.closest(controls))return false;
  for(let node=target;node&&root.contains(node);node=node.parentElement){
   const overflow=getComputedStyle(node).overflowX;
   if(node.scrollWidth>node.clientWidth+1&&['auto','scroll'].includes(overflow))return false;
   if(node===root)break;
  }
  return true;
 }
 function start(event){
  cancel();
  if(event.touches.length!==1||blocked()||!tabs.includes(current()))return;
  const touch=event.touches[0],bounds=root.getBoundingClientRect();
  if(navigationEdge(touch.clientX,innerWidth))return;
  // Native view-transition snapshots temporarily hit-test as the document.
  // Keep ownership of touches inside Discover while that animation is active.
  const snapshot=isTransitioning()&&event.target===surface.documentElement&&touch.clientX>=bounds.left&&touch.clientX<=bounds.right&&touch.clientY>=bounds.top&&touch.clientY<=bounds.bottom;
  if(!snapshot&&(!root.contains(event.target)||!eligible(event.target)))return;
  gesture={id:touch.identifier,x:touch.clientX,y:touch.clientY,tab:current(),axis:null};
 }
 function move(event){
  if(!gesture)return;
  if(event.touches.length!==1||blocked()||current()!==gesture.tab){cancel();return;}
  const touch=event.touches[0],dx=Math.abs(touch.clientX-gesture.x),dy=Math.abs(touch.clientY-gesture.y);
  if(touch.identifier!==gesture.id){cancel();return;}
  if(!gesture.axis&&Math.max(dx,dy)>=12){
   if(dx>dy*1.5)gesture.axis='horizontal';
   else {cancel();return;}
  }
  if(gesture.axis==='horizontal'){
   if(event.cancelable)event.preventDefault();
   const delta=touch.clientX-gesture.x,next=tabs[tabs.indexOf(gesture.tab)+(delta<0?1:-1)];
   onMove(next?delta:delta*.15);
  }
 }
 function end(event){
  const done=gesture;gesture=null;
  if(!done||event.touches.length||blocked()||current()!==done.tab){onCancel();return;}
  const touch=[...event.changedTouches].find(item=>item.identifier===done.id);if(!touch){onCancel();return;}
  const dx=touch.clientX-done.x,dy=touch.clientY-done.y;
  if(Math.abs(dx)<64||Math.abs(dx)<=Math.abs(dy)*1.5){onCancel();return;}
  const next=tabs[tabs.indexOf(done.tab)+(dx<0?1:-1)];if(next)select(next);else onCancel();
 }
 const cancel=()=>{gesture=null;onCancel();};
 surface.addEventListener('touchstart',start,{capture:true,passive:true});
 surface.addEventListener('touchmove',move,{capture:true,passive:false});
 surface.addEventListener('touchend',end,{capture:true,passive:true});
 surface.addEventListener('touchcancel',cancel,{capture:true,passive:true});
 return ()=>{cancel();surface.removeEventListener('touchstart',start,true);surface.removeEventListener('touchmove',move,true);surface.removeEventListener('touchend',end,true);surface.removeEventListener('touchcancel',cancel,true);};
}
