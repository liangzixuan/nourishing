// This small bootstrap is network-only so an older public cache can discover updates.
const service=navigator.serviceWorker;
if(service&&window.isSecureContext){
 const copy={en:['Update ready','Reload','Later'],fr:['Mise à jour prête','Recharger','Plus tard'],de:['Update bereit','Neu laden','Später'],'pt-BR':['Atualização pronta','Recarregar','Mais tarde']};
 let registration,notice,accepted=false,reloading=false,dismissed,lastCheck=0,hadController=Boolean(service.controller);
 const words=()=>copy[document.documentElement.lang]??copy.en;
 function show(worker){
  if(dismissed===worker||accepted)return;
  notice?.remove();notice=document.createElement('aside');notice.className='pwa-update';notice.setAttribute('role','status');
  const [title,label,later]=words(),text=document.createElement('span'),reload=document.createElement('button'),close=document.createElement('button');text.textContent=title;reload.type=close.type='button';reload.textContent=label;close.textContent='×';close.setAttribute('aria-label',later);
  close.onclick=()=>{dismissed=worker;notice.remove();};
  reload.onclick=()=>{if(accepted)return;accepted=true;reload.disabled=true;if(worker)worker.postMessage({type:'ACTIVATE_UPDATE'});else location.reload();};
  notice.append(text,reload,close);document.body.append(notice);
 }
 function inspect(){
  const worker=registration?.waiting;if(!worker)return;
  // A previously downloaded release may predate the activation message handler.
  const channel=new MessageChannel(),timer=setTimeout(()=>channel.port1.close(),1500);
  channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();if(event.data?.ready===true&&registration.waiting===worker)show(worker);};
  worker.postMessage({type:'CHECK_UPDATE'},[channel.port2]);
 }
 function watch(){const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')inspect();});inspect();}
 async function check(){if(!registration||!navigator.onLine||Date.now()-lastCheck<30000)return;lastCheck=Date.now();try{await registration.update();watch();}catch{/* Keep the current cached app available while offline. */}}
 async function checkNow(){
  if(!navigator.onLine)return {status:'offline'};
  lastCheck=Date.now();
  try{
   if(!registration){registration=await service.register('/sw.js',{scope:'/',updateViaCache:'none'});registration.addEventListener('updatefound',watch);}
   await registration.update();
   if(registration.waiting){dismissed=undefined;inspect();return {status:'update'};}
   const installing=registration.installing;
   if(installing){
    watch();
    const state=await new Promise(resolve=>{
     const timer=setTimeout(()=>{installing.removeEventListener('statechange',done);resolve('timeout');},20000);
     const done=()=>{if(['installed','activated','redundant'].includes(installing.state)){clearTimeout(timer);installing.removeEventListener('statechange',done);resolve(installing.state);}};
     installing.addEventListener('statechange',done);done();
    });
    if(state==='installed'||registration.waiting){dismissed=undefined;inspect();return {status:'update'};}
    if(state==='activated')return {status:'up-to-date'};
    return {status:'error'};
   }
   return {status:'up-to-date'};
  }catch{return {status:'error'};}
 }
 globalThis[Symbol.for('nourishing.checkUpdate')]=checkNow;
 service.addEventListener('controllerchange',()=>{if(accepted&&!reloading){reloading=true;location.reload();}else if(hadController)show(null);hadController=true;});
 async function start(){try{registration=await service.register('/sw.js',{scope:'/',updateViaCache:'none'});registration.addEventListener('updatefound',watch);watch();void check();}catch{/* Installation must not block the app. */}}
 window.addEventListener('online',check);window.addEventListener('pageshow',check);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void check();});
 if(document.readyState==='complete')void start();else window.addEventListener('load',start,{once:true});
}
