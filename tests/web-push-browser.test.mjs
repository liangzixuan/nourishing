import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';

test('notification controls require explicit permission/connect/test clicks and preserve uncertain test identity',async()=>{
 let delaySubscribe,lostMutation,includeOther=false;
 let paused=true,revision=0,connected=false,lose=true,rejectUnsubscribe=false;const requests=[],id='a'.repeat(36),publicKey=Buffer.alloc(65,1).toString('base64url');
 const otherDevice={id:'b'.repeat(36),label:'Other browser',currentOrigin:true,endpointDigest:'b'.repeat(64)};
 const status=()=>({configured:true,paused,revision,publicKey,devices:[...(includeOther?[otherDevice]:[]),...(connected?[{id,label:'This browser',currentOrigin:true,endpointDigest:createHash('sha256').update(JSON.stringify('https://fcm.googleapis.com/fcm/send/browser-fixture')).digest('hex')}]:[])],limit:8});
 const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){res.setHeader('Content-Type','text/html');return res.end(`<link rel="stylesheet" href="/reminders.css"><button id="open">Open notifications</button><div id="sheet"></div><script type="module">import {mountReminders} from '/reminders.js';await(await import('/device-cache.js')).initializeDeviceCache('push-test');const content=document.querySelector('#sheet');document.querySelector('#open').onclick=()=>{content.innerHTML='<button data-close>Close</button><div id=host></div>';content.querySelector('[data-close]').onclick=()=>content.replaceChildren();mountReminders({root:content.querySelector('#host'),notifications:location.search==='?notifications'});};document.querySelector('#open').click();</script>`);}
  if(path.startsWith('/api/reminders')){
   res.setHeader('Content-Type','application/json');let input=null;if(req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;input=JSON.parse(raw);}requests.push({path,input});
   if(path==='/api/reminders/settings'){assert.equal(input.revision,revision);paused=input.paused;revision++;return res.end(JSON.stringify(status()));}
   if(path==='/api/reminders/subscribe'){await delaySubscribe;connected=true;if(lostMutation==='add'){lostMutation=null;res.writeHead(503);return res.end(JSON.stringify({error:'Reply lost'}));}return res.end(JSON.stringify({deviceId:id,...status()}));}
   if(path==='/api/reminders/unsubscribe'){if(rejectUnsubscribe){res.writeHead(503);return res.end(JSON.stringify({error:'Offline'}));}connected=false;if(lostMutation==='remove'){lostMutation=null;res.writeHead(503);return res.end(JSON.stringify({error:'Reply lost'}));}return res.end(JSON.stringify(status()));}
   if(path==='/api/reminders/test'){if(lose){lose=false;res.writeHead(503);return res.end(JSON.stringify({error:'Connection interrupted.'}));}return res.end(JSON.stringify({outcome:'accepted',statusCode:201}));}
   return res.end(JSON.stringify(status()));
  }
  const name=path.slice(1),file=new URL('../public/'+name,import.meta.url);if(!/^[\w./-]+\.(m?js|css)$/.test(name)||!existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',/\.m?js$/.test(name)?'text/javascript':'text/css');res.end(readFileSync(file));
 }catch(error){res.writeHead(500).end(JSON.stringify({error:error.message}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const page=await browser.newPage({viewport:{width:412,height:915}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({publicKey})=>{
   window.pushEvidence={permissions:0,subscribes:0,unsubscribes:0};let subscription=null;
   Object.defineProperty(window,'Notification',{value:{permission:'default',requestPermission:async()=>{window.pushEvidence.permissions++;window.permissionWasActive=navigator.userActivation.isActive;return Notification.permission=window.denyPermission?'denied':'granted';}}});Object.defineProperty(window,'PushManager',{value:class{}});
   const manager={getSubscription:async()=>subscription,subscribe:async options=>{window.pushEvidence.subscribes++;subscription={endpoint:'https://fcm.googleapis.com/fcm/send/browser-fixture',options,toJSON:()=>({endpoint:subscription.endpoint,expirationTime:null,keys:{p256dh:publicKey,auth:'synthetic'}}),unsubscribe:async()=>{window.pushEvidence.unsubscribes++;if(window.failUnsubscribe)throw Error('Browser unavailable');subscription=null;return true;}};return subscription;}};
   const ready={active:{state:'activated'},pushManager:manager};
   window.simulateInstall=({missing=false}={})=>{
    const worker=new EventTarget();worker.state='installing';
    const registration={installing:worker,active:null,pushManager:manager};
    window.currentRegistration=missing?null:registration;
    window.installRegistration=registration;
    window.settleInstall=success=>{
     worker.state=success?'activated':'redundant';
     registration.installing=null;if(success)registration.active=worker;
     worker.dispatchEvent(new Event('statechange'));
    };
   };
   window.currentRegistration=ready;
   Object.defineProperty(navigator,'serviceWorker',{value:{
    getRegistration:async()=>window.currentRegistration,
    register:async()=>{window.currentRegistration=window.installRegistration;return window.currentRegistration;}
   }});
  },{publicKey});
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByRole('button',{name:'Connect this browser',exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.pushEvidence),{permissions:0,subscribes:0,unsubscribes:0});assert.equal(requests.some(row=>row.path.endsWith('/test')),false);
  await page.getByRole('button',{name:'Connect this browser',exact:true}).click();await page.getByRole('button',{name:'Test',exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.pushEvidence),{permissions:1,subscribes:1,unsubscribes:0});assert.equal(requests.some(row=>row.path.endsWith('/test')),false);
  await page.getByRole('button',{name:'Test',exact:true}).click();await page.getByRole('button',{name:'Check result',exact:true}).waitFor();
  await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Open notifications',exact:true}).click();await page.locator('summary').filter({hasText:'Connected devices'}).click();await page.getByRole('button',{name:'Check result',exact:true}).click();await page.getByText('Sent. Check your notifications.',{exact:true}).waitFor();
  const tests=requests.filter(row=>row.path.endsWith('/test'));assert.equal(tests.length,2);assert.deepEqual(tests[0].input,tests[1].input);
  await page.getByRole('button',{name:'Send test',exact:true}).click();
  await page.getByText('Sent. Check your notifications.',{exact:true}).waitFor();
  const localTest=requests.filter(row=>row.path.endsWith('/test')).at(-1).input;
  assert.equal(localTest.endpoint,'https://fcm.googleapis.com/fcm/send/browser-fixture');
  assert.ok(!Object.hasOwn(localTest,'deviceId'));
  await page.getByRole('button',{name:'Disconnect this browser',exact:true}).click();await page.getByText('Disconnected.',{exact:true}).waitFor();assert.equal((await page.evaluate(()=>window.pushEvidence)).unsubscribes,1);
  await page.getByRole('button',{name:'Connect this browser',exact:true}).click();await page.getByRole('button',{name:'Test',exact:true}).waitFor();rejectUnsubscribe=true;
  const serverUnavailable=await page.evaluate(async()=>{const {disconnectCurrentPush}=await import('/reminders.js');return disconnectCurrentPush();});assert.deepEqual(serverUnavailable,{disconnected:true,serverDisconnected:false,browserDisconnected:true});
  rejectUnsubscribe=false;await page.getByRole('button',{name:'Connect this browser',exact:true}).click();await page.getByText('Connected. Send a test notification.',{exact:true}).waitFor();
  await page.evaluate(()=>{window.failUnsubscribe=true;});const browserUnavailable=await page.evaluate(async()=>{const {disconnectCurrentPush}=await import('/reminders.js');return disconnectCurrentPush();});assert.deepEqual(browserUnavailable,{disconnected:true,serverDisconnected:true,browserDisconnected:false});
  assert.equal(requests.some(row=>row.path.endsWith('/settings')),false);assert.deepEqual(errors,[]);
  includeOther=true;
  await page.goto(`http://127.0.0.1:${server.address().port}/?notifications`);
  const allow=page.getByRole('switch',{name:'Allow Notifications',exact:true});
  const connectionReads=()=>requests.filter(r=>r.path==='/api/reminders/connection').length;
  await allow.waitFor();assert.equal(connectionReads(),0,'permission off requires no server read');assert.equal(await allow.isChecked(),false);
  assert.equal(await page.locator('#host button,#host details,#host select').count(),0);
  assert.equal(await page.evaluate(()=>window.pushEvidence.permissions),0);
  await page.evaluate(()=>window.denyPermission=true);await allow.click();await page.getByRole('status').filter({hasText:'not allowed'}).waitFor();
  assert.equal(await allow.isChecked(),false);assert.equal(paused,true);
  await page.evaluate(()=>{Notification.permission='default';window.denyPermission=false;});
  let release;delaySubscribe=new Promise(resolve=>release=resolve);
  const submitting=page.waitForRequest(request=>request.url().endsWith('/api/reminders/subscribe'));
  await page.getByText('Allow Notifications',{exact:true}).click();await submitting;
  try{assert.equal(await allow.isChecked(),true,'keep the requested position while saving');assert.equal(await allow.isDisabled(),true);assert.equal(await page.evaluate(()=>window.permissionWasActive),true);}finally{release();}
  await page.waitForFunction(()=>document.querySelector('[data-notifications-enabled]:checked:enabled'));
  assert.equal(connected,true);assert.equal(paused,true);
  const readsBeforeReopen=connectionReads();
  assert.equal(await page.locator('#host button,#host details,#host select').count(),0);
  await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Open notifications',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-notifications-enabled]:checked:enabled'));
  assert.equal(connectionReads(),readsBeforeReopen,'reopen uses the account’s acknowledged connection');
  await page.evaluate(async()=>{await(await import('/device-cache.js')).initializeDeviceCache('other-account');});
  connected=false;
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Open notifications',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-notifications-enabled]:not(:checked):enabled'));
  assert.equal(connectionReads(),readsBeforeReopen+1,'a new account checks its own registration');
  await page.evaluate(async()=>{await(await import('/device-cache.js')).initializeDeviceCache('push-test');});
  connected=true;
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Open notifications',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-notifications-enabled]:checked:enabled'));
  lostMutation='remove';await allow.click();await page.waitForFunction(()=>document.querySelector('[data-notifications-enabled]:not(:checked):enabled'));
  assert.equal(connected,false);assert.equal(paused,true);assert.equal(await page.evaluate(()=>window.pushEvidence.unsubscribes),1);
  lostMutation='add';await allow.press('Space');await page.waitForFunction(()=>document.querySelector('[data-notifications-enabled]:checked:enabled'));
  assert.equal(await page.locator('[role=status]').textContent(),'');assert.equal(connected,true);
  await allow.click();await page.waitForFunction(()=>document.querySelector('[data-notifications-enabled]:not(:checked):enabled'));
  await page.evaluate(()=>window.simulateInstall({missing:true}));
  await allow.click();
  await page.waitForFunction(()=>window.currentRegistration?.installing||document.querySelector('[role=status]')?.textContent.includes('Refresh Nourishing'));
  assert.equal(await allow.isDisabled(),true,'first tap waits for installation');
  await page.evaluate(()=>window.settleInstall(true));
  await page.waitForFunction(()=>document.querySelector('[data-notifications-enabled]:checked:enabled'));
  assert.equal(connected,true);await allow.click();
  await page.waitForFunction(()=>document.querySelector('[data-notifications-enabled]:not(:checked):enabled'));
  await page.evaluate(()=>window.simulateInstall());
  await allow.click();await page.evaluate(()=>window.settleInstall(false));
  await page.getByRole('status').filter({hasText:'Refresh Nourishing'}).waitFor();
  assert.equal(await allow.isChecked(),false);assert.equal(connected,false);
  await page.evaluate(()=>window.simulateInstall());
  await allow.click();await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.evaluate(()=>window.settleInstall(true));
  await page.getByRole('button',{name:'Open notifications',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-notifications-enabled]:not(:checked):enabled'));
  assert.deepEqual(status().devices,[otherDevice]);assert.equal(connected,false);
  assert.deepEqual(requests.filter(row=>row.path.endsWith('/settings')).map(row=>row.input.paused),[]);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
