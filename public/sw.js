// This cache contains only the public offline screen. Account/API responses,
// photos, downloaded backups and authenticated pages are never cached here.
const CACHE='nourishing-public-offline-v1';
const FILES=['/offline.html','/offline.css','/favicon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
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
 if(!url.search&&FILES.includes(url.pathname))event.respondWith(fetch(request).catch(async()=>{
  const cache=await caches.open(CACHE);return await cache.match(url.pathname)||Response.error();
 }));
});

self.addEventListener('push',event=>{
 let payload;try{payload=event.data?.json();}catch{}
 const tag=payload?.version===1&&/^nourishing-[a-f0-9]{36}$/.test(payload.tag)?payload.tag:'nourishing-reminder';
 event.waitUntil(self.registration.showNotification('Nourishing',{
  body:'Your reminder is ready. Open Nourishing when convenient.',
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
