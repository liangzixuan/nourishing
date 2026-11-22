import {CHROME_EXECUTABLE} from './_chrome.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {offlineSnapshot} from '../server/offline.mjs';
import {displayView} from '../server/display-settings.mjs';
import {barcodeAssets} from '../scripts/package-barcode-assets.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';

test('source More menu preserves search and back focus, cloud destinations and device theme',async()=>{
 let theme='dark',revision='one',delayTargets=null,delayAccount=null,accountReads=0,owner='owner-a',origin;const writes=[];
 const reminders={configured:true,paused:true,revision:0,schedules:[],devices:[{id:'fixture',currentOrigin:true}],recent:[]};
 const vendor=new Map((await barcodeAssets()).map(asset=>['/'+asset.path,asset]));
 const server=createServer(async(req,res)=>{try{
  if(req.url.startsWith('/api/reminders')){
   if(req.url==='/api/reminders/settings'){
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=JSON.parse(raw);assert.equal(body.revision,reminders.revision);reminders.paused=body.paused;reminders.revision++;
   }
   res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(reminders));
  }
  if(req.url==='/api/offline'){const state=initialState();state.settings.theme=theme;res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(offlineSnapshot(state,{ownerId:owner,generation:'fixture'})));}
  if(req.url.startsWith('/api/diary')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({revision}));}
  if(req.url==='/api/display'){if(delayTargets)await delayTargets;res.setHeader('Content-Type','application/json');const state=initialState();state.settings.theme=theme;res.end(JSON.stringify({...displayView(state),revision}));return;}
  if(req.url.startsWith('/api/targets')){if(delayTargets)await delayTargets;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({revision,theme,nutrients:[{id:'protein',name:'Protein',dailyTarget:100,maximum:null,visible:true,unit:'g'}]}));return;}
  if(req.url==='/api/workspace/command'){const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks));if(body.revision!==revision){res.writeHead(409,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Changed revision'}));}writes.push(body);assert.equal(body.type,'display.save');theme=body.payload.theme;revision='next-'+writes.length;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({revision}));return;}
  if(req.url==='/api/account'){accountReads++;if(delayAccount)await delayAccount;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:owner,name:owner,email:owner+'@example.com',emailVerified:true,profile:{timeZone:'UTC',units:'metric'},privateProviderField:'must-not-cache'}));return;}
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'");res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/streak-source/fonts.css"><link rel="stylesheet" href="/more.css"><link rel="stylesheet" href="/account-surface.css"><link rel="stylesheet" href="/nutrition.css"><body class="discover-mobile dark"><div class="app-shell"><header class="app-header topbar"></header><main id="page"></main></div><dialog id="sheet"><div id="sheet-content"></div></dialog><script type="module" src="/fixture.js"></script>');return;}
  if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(`import {mountMore} from '/more.js';await(await import('/device-cache.js')).initializeDeviceCache('owner-a');const page=document.querySelector('#page'),headerRoot=document.querySelector('.app-header'),sheet=document.querySelector('#sheet'),content=document.querySelector('#sheet-content');window.more=mountMore({page,headerRoot,date:()=> '2026-11-15',show:html=>{content.innerHTML=html;if(!sheet.open)sheet.showModal()},close:()=>sheet.close(),header:title=>'<h2>'+title+'</h2>',content,onChange:async()=>{},onFoods:()=>{window.destination='foods'},onDiscover:tab=>{window.destination=tab}});`);return;}
  if(vendor.has(req.url)){const asset=vendor.get(req.url);res.setHeader('Content-Type',asset.type);res.end(asset.body);return;}
  const file=path.resolve('public','.'+new URL(req.url,origin).pathname);if(!file.startsWith(path.resolve('public')+path.sep))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(readFileSync(file));
 }catch(error){res.writeHead(500);res.end(error.message);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;let browser;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const page=await browser.newPage({viewport:{width:412,height:915},colorScheme:'dark'}),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});await page.goto(origin);
  await page.getByRole('heading',{name:'More',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Targets',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'Connect Apps & Devices',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Referrals',exact:true}).count(),0);
  await page.getByRole('button',{name:'About',exact:true}).click();await page.getByText(`Version ${JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version}`,{exact:true}).waitFor();await page.getByRole('button',{name:'Check for updates',exact:true}).click();await page.getByText('You are up to date.',{exact:true}).waitFor();await page.goBack();await page.getByRole('heading',{name:'More',exact:true}).waitFor();assert.equal(page.url(),origin+'/');
  await page.getByRole('button',{name:'About',exact:true}).click();await page.getByText(`Version ${JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version}`,{exact:true}).waitFor();await page.getByRole('button',{name:'Back',exact:true}).click();
  const search=page.getByRole('searchbox',{name:'Search More'});await search.fill('target');assert.equal(await page.getByRole('button',{name:'Profile',exact:true}).isVisible(),false);await page.getByRole('button',{name:'Targets',exact:true}).click();await page.locator('[data-mt-home]').waitFor();assert.equal(await page.getByRole('heading',{name:'Targets & Settings',exact:true}).count(),0);await page.getByRole('button',{name:'Back',exact:true}).click();assert.equal(await search.inputValue(),'target');assert.equal(await search.evaluate(node=>node===document.activeElement),false);
  await search.fill('not a destination');await page.getByText('No results',{exact:true}).waitFor();await search.fill('');
  await page.getByRole('button',{name:'Display',exact:true}).click();await page.locator('[data-display-open=theme]').click();await page.getByRole('radio',{name:'Light',exact:true}).check();await page.getByRole('button',{name:'OK',exact:true}).click();await page.waitForFunction(()=>!document.body.classList.contains('dark'));await page.locator('[data-display-open=theme]').click();await page.getByRole('radio',{name:'System',exact:true}).check();await page.getByRole('button',{name:'OK',exact:true}).click();await page.waitForFunction(()=>document.body.classList.contains('dark'));await page.evaluate(async()=>{await(await import('/background-writes.js')).flushBackgroundWrites();});assert.deepEqual(writes.map(row=>row.payload),[{theme:'light'},{theme:'system'}]);assert.ok(writes.every(row=>typeof row.requestId==='string'));
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Sharing',exact:true}).click();await page.getByRole('button',{name:'Reports',exact:true}).click();assert.equal(await page.evaluate(()=>window.destination),'report');await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Backup & Restore',exact:true}).click();await page.getByRole('button',{name:'Download backup',exact:true}).waitFor();await page.getByRole('button',{name:'Back',exact:true}).click();assert.equal(await search.evaluate(node=>node===document.activeElement),false);
  mkdirSync('.local',{recursive:true});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'.local/more-parity.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const destination of ['Display']){
   let release;delayTargets=new Promise(resolve=>release=resolve);const started=page.waitForRequest(request=>request.url().endsWith('/api/display'));await page.getByRole('button',{name:destination,exact:true}).click();await started;await page.getByRole('button',{name:'Back',exact:true}).click();release();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.getByRole('heading',{name:'More',exact:true}).count(),1);assert.equal(await page.getByLabel('Theme',{exact:true}).count(),0);assert.equal(await page.locator('.target-list').count(),0);delayTargets=null;
  }
  await page.evaluate(async()=>{await(await import('/device-cache.js')).initializeDeviceCache('owner-a');});
  await page.getByRole('button',{name:'Account',exact:true}).click();await page.getByRole('button',{name:'Change email',exact:true}).waitFor();assert.equal(page.url(),origin+'/');assert.equal(await page.getByRole('link',{name:'Back to diary',exact:false}).count(),0);
  await page.getByRole('button',{name:'Edit name',exact:true}).click();await page.getByRole('dialog').waitFor();await page.evaluate(()=>window.more.back());assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.getByRole('heading',{name:'Account',exact:true}).count(),1);
  await page.getByRole('button',{name:'Back',exact:true}).click();assert.equal(await search.evaluate(node=>node===document.activeElement),false);
  await page.locator('[data-more-open=support]').click();assert.equal(await page.getByRole('link',{name:/Report a bug/}).getAttribute('href'),'https://github.com/liangzixuan/nourishing/issues');
  await page.locator('[data-more-open=manual]').click();await page.locator('.mm-manual-topic summary').first().click();await page.getByText(/Swipe left to reveal Delete/).waitFor();
  await page.goBack();await page.getByRole('heading',{name:'Support',exact:true}).waitFor();await page.locator('[data-more-back]').click();
  await page.locator('[data-more-open=about]').click();await page.locator('[data-more-open=licenses]').click();await page.getByRole('button',{name:'Chart.js',exact:true}).click();await page.locator('.mm-license').filter({hasText:'Permission is hereby granted'}).waitFor();await page.locator('[data-more-back]').click();
  await page.goBack();await page.getByRole('heading',{name:'About',exact:true}).waitFor();await page.locator('[data-more-back]').click();
  await page.locator('[data-more-open=account]').click();await page.locator('[data-more-open=account-data]').click();await page.locator('#delete-account').click();await page.locator('.deletion-close').click();
  await page.locator('[data-more-back]').click();await page.locator('[data-more-open=notifications]').click();
  const toggle=page.getByRole('switch',{name:'Allow Notifications',exact:true});await toggle.waitFor();assert.equal(await toggle.isChecked(),false);
  const help=page.locator('[data-notification-help]');
  await help.click();
  const guide=page.locator('#sheet [data-manual-topic=notifications][open]');
  await guide.getByText(/seven days after my last entry/).waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#sheet[open]').waitFor({state:'detached'});
  assert.equal(await help.evaluate(node=>node===document.activeElement),true);
  assert.equal(await toggle.isChecked(),false);
  await toggle.check();await page.getByRole('switch',{name:'Reminder to Log Food',exact:true}).waitFor();
  await page.locator('.push-custom-schedules>summary').click();await page.locator('[data-reminder-action=add]').waitFor();assert.equal(reminders.paused,false);
  await toggle.uncheck();await page.locator('[data-reminder-action=add]').waitFor({state:'detached'});assert.equal(reminders.paused,true);
  await page.locator('[data-more-back]').click();await page.locator('[data-more-open=notifications]').waitFor();await page.locator('[data-more-back]').click();
  const readsBefore=accountReads;await page.getByRole('button',{name:'Account',exact:true}).click();await page.getByRole('button',{name:'Change email',exact:true}).waitFor();assert.equal(accountReads,readsBefore);
  const cached=await page.evaluate(async()=>{const c=await import('/device-cache.js');return {display:(await c.readDeviceCache('/api/account?view=display')).value,auth:(await c.readDeviceCache('/api/account')).value};});assert.equal(cached.display.id,'owner-a');assert.equal(cached.display.privateProviderField,undefined);assert.equal(cached.auth,undefined);
  await page.getByRole('button',{name:'Back',exact:true}).click();owner='owner-b';await page.evaluate(async()=>{await(await import('/device-cache.js')).initializeDeviceCache('owner-b');});
  await page.getByRole('button',{name:'Account',exact:true}).click();await page.getByText('owner-b@example.com',{exact:true}).waitFor();assert.equal(await page.getByText('owner-a@example.com',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.evaluate(async()=>{await(await import('/device-cache.js')).invalidateDeviceCache();});let release;delayAccount=new Promise(resolve=>release=resolve);const started=page.waitForRequest(request=>request.url().endsWith('/api/account'));await page.getByRole('button',{name:'Account',exact:true}).click();await started;await page.getByRole('button',{name:'Back',exact:true}).click();release();delayAccount=null;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.getByRole('heading',{name:'More',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'Change email',exact:true}).count(),0);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
