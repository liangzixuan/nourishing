/** Owns transient visual state; the browser owns snapshots of the outgoing screen. */
export function createDiscoverMotion(root){
 let disposed=false,run=0,transition=null,drag=null,animations=[];
 const document=root.ownerDocument,html=document.documentElement;
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 function clearDrag(){drag?.cancel();drag=null;}
 function cancel(){run++;transition?.skipTransition();transition=null;for(const animation of animations)animation.cancel();animations=[];clearDrag();html.classList.remove('discover-transition');}
 function preview(offset){
  if(disposed||reduced()||transition)return;
  const width=root.clientWidth||1;
  if(!drag){drag=root.animate([{transform:`translateX(${-width}px)`},{transform:`translateX(${width}px)`}],{duration:width*2,fill:'both'});drag.pause();}
  drag.currentTime=width+Math.max(-width*.7,Math.min(width*.7,offset));
 }
 function reset(){
  if(!drag)return;
  const transform=getComputedStyle(root).transform;clearDrag();
  if(!disposed&&!reduced()){
   const animation=root.animate([{transform},{transform:'translateX(0)'}],{duration:150,easing:'cubic-bezier(.2,.8,.2,1)'});
   animations.push(animation);animation.finished.finally(()=>{animations=animations.filter(item=>item!==animation);}).catch(()=>{});
  }
 }
 function change(direction,update){
  if(disposed)return;
  // Capture the finger position, then let the browser snapshot the old content
  // at its stable bounds. The pseudo-element starts at that same position.
  const offset=drag?drag.currentTime-root.clientWidth:0;
  cancel();const id=run;
  if(reduced()||!document.startViewTransition){void update();return;}
  html.classList.add('discover-transition');
  transition=document.startViewTransition(async()=>{
   if(disposed||id!==run||!root.isConnected)return;
   let timer;const ready=await Promise.race([Promise.resolve(update()).then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),400);})]);clearTimeout(timer);
   // Do not freeze an uncached/erroring request behind a transition snapshot.
   // The normal loading/error screen remains usable after this short bound.
   if(!ready&&id===run)transition?.skipTransition();
  });
  const owned=transition;
  owned.ready.then(()=>{
   if(disposed||id!==run||!root.isConnected)return;
   const width=root.clientWidth,options={duration:230,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'};
   animations=[
    html.animate([{transform:`translateX(${offset}px)`},{transform:`translateX(${-direction*width}px)`}],{...options,pseudoElement:'::view-transition-old(discover-content)'}),
    html.animate([{transform:`translateX(${direction*width+offset}px)`},{transform:'translateX(0)'}],{...options,pseudoElement:'::view-transition-new(discover-content)'})
   ];
  }).catch(()=>{});
  owned.finished.finally(()=>{if(id===run){transition=null;for(const animation of animations)animation.cancel();animations=[];html.classList.remove('discover-transition');}}).catch(()=>{});
 }
 return {preview,reset,change,cancel,dispose(){disposed=true;cancel();}};
}
