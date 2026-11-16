const tabs=['dashboard','charts','report','snapshots'];
const controls='a,button,input,select,textarea,label,summary,canvas,svg,.mcl-plot,.chart-canvas,.dc-chart,.report-energy-ring,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="slider"],[role="tab"],[data-discover-swipe-ignore]';

/** A touch gesture owns navigation only after horizontal intent on plain content. */
export function bindDiscoverSwipe(root,{current,select,onMove=()=>{},onCancel=()=>{}}){
 let gesture=null;
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
  if(event.touches.length!==1||blocked()||!tabs.includes(current())||!eligible(event.target))return;
  const touch=event.touches[0];
  gesture={id:touch.identifier,x:touch.clientX,y:touch.clientY,tab:current(),target:event.target,axis:null};
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
  if(!done||event.touches.length||blocked()||current()!==done.tab||!done.target.isConnected){onCancel();return;}
  const touch=[...event.changedTouches].find(item=>item.identifier===done.id);if(!touch){onCancel();return;}
  const dx=touch.clientX-done.x,dy=touch.clientY-done.y;
  if(Math.abs(dx)<64||Math.abs(dx)<=Math.abs(dy)*1.5){onCancel();return;}
  const next=tabs[tabs.indexOf(done.tab)+(dx<0?1:-1)];if(next)select(next);else onCancel();
 }
 const cancel=()=>{gesture=null;onCancel();};
 root.addEventListener('touchstart',start,{passive:true});
 root.addEventListener('touchmove',move,{passive:false});
 root.addEventListener('touchend',end,{passive:true});
 root.addEventListener('touchcancel',cancel,{passive:true});
 return ()=>{cancel();root.removeEventListener('touchstart',start);root.removeEventListener('touchmove',move);root.removeEventListener('touchend',end);root.removeEventListener('touchcancel',cancel);};
}
