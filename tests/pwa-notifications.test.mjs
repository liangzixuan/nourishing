import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reminderPayload} from '../server/reminder-payload.mjs';
import {runInNewContext} from 'node:vm';

function worker(windows=[]){
 const handlers=new Map(),notices=[],opened=[],focused=[],origin='https://nourishing.example';
 const self={location:{origin},registration:{showNotification:async(title,options)=>notices.push({title,...options})},clients:{matchAll:async()=>windows.map(url=>({url,focus:async()=>focused.push(url)})),openWindow:async url=>opened.push(url)},addEventListener:(name,callback)=>handlers.set(name,callback)};
 runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL,importScripts:path=>{assert.equal(path,'/offline-assets.js');self.NOURISHING_OFFLINE={cache:'fixture-public-cache',files:['/offline.html']};}});
 const emit=async(name,event={})=>{let pending;handlers.get(name)({...event,waitUntil:promise=>pending=promise});await pending;};
 return {emit,notices,opened,focused,origin};
}
test('push notifications show generic content and never payload text or destinations',async()=>{
 const w=worker(),tag='nourishing-'+'a'.repeat(36);
 await w.emit('push',{data:{json:()=>({version:1,tag,title:'Private record',body:'health detail',url:'https://other.example'})}});
 assert.equal(w.notices[0].title,'Nourishing');assert.equal(w.notices[0].tag,tag);assert.equal(w.notices[0].icon,'/pwa-icons/icon-192.png');
 assert.ok(!JSON.stringify(w.notices).includes('health detail'));assert.equal(w.notices[0].data,undefined);
 await w.emit('push',{data:{json:()=>{throw Error('bad payload');}}});assert.equal(w.notices[1].tag,'nourishing-reminder');
});
test('notification click focuses this app or opens its diary, ignoring notification data',async()=>{
 const w=worker(['https://other.example','https://nourishing.example/account']);let closed=0;
 const event={notification:{data:{url:'https://other.example'},close:()=>closed++}};
 await w.emit('notificationclick',event);assert.deepEqual(w.focused,['https://nourishing.example/account']);assert.deepEqual(w.opened,[]);assert.equal(closed,1);
 const empty=worker(['https://other.example']);await empty.emit('notificationclick',event);assert.deepEqual(empty.opened,['/diary']);
});


test('generic push text uses supported captured languages and rejects invalid language or payload version',async()=>{
 const w=worker(),tag='nourishing-'+'b'.repeat(36),expected={en:'Your reminder is ready.',fr:'Votre rappel est prêt.',de:'Deine Erinnerung ist bereit.','pt-BR':'Seu lembrete está pronto.'};
 for(const [language,prefix]of Object.entries(expected)){await w.emit('push',{data:{json:()=>({version:1,tag,language,body:'Private detail'})}});assert.ok(w.notices.at(-1).body.startsWith(prefix));assert.equal(w.notices.at(-1).title,'Nourishing');}
 for(const language of [undefined,'es','constructor','__proto__',null,{toString:()=> 'fr'}]){await w.emit('push',{data:{json:()=>({version:1,tag,language})}});assert.ok(w.notices.at(-1).body.startsWith(expected.en));}
 await w.emit('push',{data:{json:()=>({version:2,tag,language:'fr'})}});assert.ok(w.notices.at(-1).body.startsWith(expected.en));assert.ok(!JSON.stringify(w.notices).includes('Private detail'));
});

test('producer locale is allowlisted without carrying arbitrary preference text',()=>{for(const language of ['en','fr','de','pt-BR'])assert.equal(JSON.parse(reminderPayload('opaque',language)).language,language);for(const language of [undefined,null,'Private note',{},'constructor'])assert.deepEqual(JSON.parse(reminderPayload('opaque',language)),{version:1,tag:'opaque',language:'en'});});
