// A docked software keyboard reduces the visible height. A hardware keyboard leaves it unchanged.
export function hideFooterWhileTyping(container,selector,footer,signal){
 const viewport=window.visualViewport;
 if(!footer||!viewport||!matchMedia('(any-pointer: coarse)').matches)return;
 let fullHeight=viewport.height,width=viewport.width,hidden=false;
 function showFooter(){
  if(hidden)footer.hidden=false;
  hidden=false;
 }
 function update(){
  if(signal.aborted)return;
  const editing=container.contains(document.activeElement)&&document.activeElement.matches(selector);
  if(viewport.scale!==1||viewport.width!==width||!editing){
   width=viewport.width;fullHeight=viewport.height;showFooter();return;
  }
  fullHeight=Math.max(fullHeight,viewport.height);
  if(viewport.height>=fullHeight)showFooter();
  else if(!hidden&&fullHeight-viewport.height>=Math.max(1,footer.offsetHeight)){
   if(footer.hidden)return;
   hidden=true;footer.hidden=true;
  }
 }
 viewport.addEventListener('resize',update,{signal});
 container.addEventListener('focusin',update,{signal});
 container.addEventListener('focusout',()=>queueMicrotask(update),{signal});
 signal.addEventListener('abort',showFooter,{once:true});
}
