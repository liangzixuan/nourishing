// Public assets use the release cache. Private data and photos stay in
// account-partitioned IndexedDB and are never put in shared CacheStorage.
importScripts('/offline-assets.js');
const {cache:CACHE,files:FILES}=self.NOURISHING_OFFLINE;
const PRELOAD=self.NOURISHING_OFFLINE.precache??FILES;
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PRELOAD))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys())if(name.startsWith('nourishing-public-offline-')&&name!==CACHE)await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).catch(async()=>{
   const cache=await caches.open(CACHE);return await cache.match('/offline.html')||Response.error();
  }));return;
 }
 if(!url.search&&FILES.includes(url.pathname))event.respondWith((async()=>{
  const cache=await caches.open(CACHE),saved=await cache.match(url.pathname);if(saved)return saved;
  const response=await fetch(request);if(response.ok)await cache.put(url.pathname,response.clone());return response;
 })());
});

const reminderBodies=Object.freeze({
 en:'Your reminder is ready. Open Nourishing when convenient.',
 fr:'Votre rappel est prêt. Ouvrez Nourishing quand vous le souhaitez.',
 de:'Deine Erinnerung ist bereit. Öffne Nourishing, wenn es dir passt.',
 'pt-BR':'Seu lembrete está pronto. Abra o Nourishing quando for conveniente.',
});
self.addEventListener('push',event=>{
 let payload;try{payload=event.data?.json();}catch{}
 const tag=payload?.version===1&&/^nourishing-[a-f0-9]{36}$/.test(payload.tag)?payload.tag:'nourishing-reminder';
 event.waitUntil(self.registration.showNotification('Nourishing',{
  body:payload?.version===1&&typeof payload.language==='string'&&Object.hasOwn(reminderBodies,payload.language)?reminderBodies[payload.language]:reminderBodies.en,
  icon:'/pwa-icons/icon-192.png',badge:'/pwa-icons/icon-192.png',tag,renotify:false,
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
  if(existing){await existing.focus();return;}
  await self.clients.openWindow('/diary');
 })());
});

self.addEventListener('message',event=>{
 if(event.data?.type==='CHECK_UPDATE'){event.ports?.[0]?.postMessage({ready:true});return;}
 if(event.data?.type==='ACTIVATE_UPDATE'){event.waitUntil(self.skipWaiting());return;}
 if(event.data?.type!=='PREPARE_OFFLINE'||!event.ports?.[0])return;
 event.waitUntil((async()=>{try{
  const cache=await caches.open(CACHE);
  if(!(await Promise.all(PRELOAD.map(file=>cache.match(file)))).every(Boolean))await cache.addAll(PRELOAD);
  event.ports[0].postMessage({ok:true});
 }catch{event.ports[0].postMessage({ok:false,error:'Could not save the offline app. Try again online.'});}})());
});
