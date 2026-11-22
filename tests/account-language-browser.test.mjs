import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,readdirSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {createWebHandler} from '../server/http.mjs';
import {initialState,act} from '../server/domain/workspace.mjs';
import {offlineSnapshot} from '../server/offline.mjs';
import {accountCloudMessages} from '../public/account-cloud-messages.js';
import {createDataRepository} from '../server/data-repository.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {barcodeAssets} from '../scripts/package-barcode-assets.mjs';
import {buildOfflineAssets} from '../scripts/package-offline-assets.mjs';

async function fixture(service){
 const assets=new Map();function visit(dir,prefix=''){for(const entry of readdirSync(dir,{withFileTypes:true})){if(entry.isDirectory())visit(dir+'/'+entry.name,prefix+'/'+entry.name);else assets.set(prefix+'/'+entry.name,{body:readFileSync(dir+'/'+entry.name),type:entry.name.endsWith('.css')?'text/css':/\.m?js$/.test(entry.name)?'text/javascript':entry.name.endsWith('.html')?'text/html':entry.name.endsWith('.svg')?'image/svg+xml':'application/octet-stream'});}}visit('public');assets.set('/',assets.get('/index.html'));assets.set('/diary',assets.get('/diary.html'));for(const asset of await barcodeAssets())assets.set('/'+asset.path,asset);
 let origin,handler;const server=createServer(async(req,res)=>{const result=await handler(new Request(origin+req.url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:req,duplex:'half'})}));res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;handler=createWebHandler({config:{origin},service,assets});return {origin,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));}};
}

test('account uses browser language before sign-in, saved language after auth and keeps caller text unchanged',async()=>{
 let language='fr',owner='first',loggedOut=false;const user=()=>({id:owner,name:'Password',email:'fixture@example.com',emailVerified:true,profile:{units:'metric',timeZone:'UTC'}});
 const host=await fixture({reauthenticateAccount:async(secret,id,pw)=>{assert.equal(id,owner);assert.equal(pw,'secret-old');},current:async()=>user(),display:async()=>({settings:{theme:'dark',appLanguage:language}}),login:async()=>{throw {code:401,publicMessage:'Provider English detail'};},logout:async()=>{loggedOut=true;}});let browser;
 try{browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const context=await browser.newContext({locale:'pt-BR',viewport:{width:412,height:915},extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.csp=[];document.addEventListener('securitypolicyviolation',e=>window.csp.push(e.violatedDirective));});
  await page.goto(host.origin+'/login');await page.getByRole('heading',{name:'Entrar',exact:true}).waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'pt-BR');await page.locator('[name=email]').fill('fixture@example.com');await page.locator('[name=password]').fill('invalid-password');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByRole('status').filter({hasText:'Verifique seu e-mail e sua senha.'}).waitFor();assert.equal(await page.getByText('Provider English detail').count(),0);
  const unavailable=await page.evaluate(async()=>{const {requestErrorMessage}=await import('/request-error.js');return requestErrorMessage(null,503);});await page.route('**/api/auth/login',route=>route.fulfill({status:200,contentType:'text/html',body:'invalid JSON'}));await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByRole('status').filter({hasText:unavailable}).waitFor();await page.unroute('**/api/auth/login');await page.route('**/api/auth/login',route=>route.abort());await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByRole('status').filter({hasText:unavailable}).waitFor();await page.unroute('**/api/auth/login');
  await page.goto(host.origin+'/account');await page.getByRole('heading',{name:'Compte',exact:true}).waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'fr');assert.equal(await page.locator('[name=units] option[value=metric]').textContent(),'Métrique');assert.equal(await page.locator('[data-account-edit=name] .muted').textContent(),'Password');await page.locator('[data-account-edit=password]').click();await page.getByRole('heading',{name:accountCloudMessages.fr['accountCloud.enterPassword']}).waitFor();await page.locator('[name=currentPassword]').fill('secret-old');await page.locator('.account-edit-dialog [type=submit]').click();await page.locator('[name=password]').fill('secret-new');await page.locator('[name=confirmPassword]').fill('different-new');await page.locator('.account-edit-dialog [type=submit]').click();await page.getByRole('status').filter({hasText:accountCloudMessages.fr['accountCloud.newPasswordsDoNotMatch']}).waitFor();assert.equal(await page.locator('[name=password]').inputValue(),'');await page.locator('[data-edit-cancel]').click();mkdirSync('.local',{recursive:true});await page.screenshot({path:'.local/account-language-fr.png'});await page.locator('#delete-account').click();await page.getByRole('heading',{name:accountCloudMessages.fr['accountCloud.deleteAccountQuestion']}).waitFor();await page.keyboard.press('Escape');
  language='de';owner='second';await page.reload();await page.getByRole('heading',{name:'Konto',exact:true}).waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'de');await page.locator('#signout').click();await page.getByRole('heading',{name:'Entrar',exact:true}).waitFor();assert.equal(loggedOut,true);assert.equal(await page.locator('html').getAttribute('lang'),'pt-BR');assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.csp),[]);
  for(const locale of ['en','fr','de','pt-BR']){const c=await browser.newContext({locale}),p=await c.newPage();await p.goto(host.origin+'/register');await p.getByRole('heading',{name:accountCloudMessages[locale]['accountCloud.createAccount'],exact:true}).waitFor();assert.equal(await p.locator('html').getAttribute('lang'),locale);await c.close();}
 }finally{await browser?.close();await host.close();}
});

test('normal offline diary keeps account language and caller text until locked or replaced',async()=>{
 await buildOfflineAssets();const day=new Date().toLocaleDateString('en-CA'),state=initialState();state.settings.appLanguage='fr';state.foods=[];
 const food=act(state,'food.save',{name:'Food',grams:100,nutrients:{calories:130}});act(state,'entry.add',{date:day,foodId:food.id,amount:1,group:'Lunch'});act(state,'note.add',{date:day,text:'Password'});
 const second=initialState();second.settings.appLanguage='de';const fixtures={first:diaryStoreFixture(state,'first'),second:diaryStoreFixture(second,'second')};let owner='first';
 const service={current:async()=>({id:owner}),readDiary:async(_secret,date)=>createDataRepository(fixtures[owner].db,owner).diary(date,{now:new Date(),asOf:new Date().toISOString(),timeZone:'UTC'}),offlineSnapshot:async()=>offlineSnapshot(owner==='first'?state:second,{ownerId:owner,generation:owner+'-gen'})};
 for(const name of ['catalogSearchIndex','display','library','favorites','recordOptions','exerciseCatalog','dashboard','profileSettings','targets','fasting','reminders','repeats','charts','snapshots','nutritionReport'])service[name]=async()=>({});
 const host=await fixture(service);let browser;
 try{browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const context=await browser.newContext({locale:'pt-BR',viewport:{width:412,height:915},extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);
  await page.goto(host.origin+'/diary');await page.locator('.md-diary').waitFor().catch(async error=>{console.log({body:await page.locator('body').innerText(),errors});throw error;});assert.equal(await page.locator('html').getAttribute('lang'),'fr');
  await page.addInitScript(()=>{if(location.pathname==='/diary-shell.html')Object.defineProperty(navigator,'onLine',{get:()=>false});});await page.goto(host.origin+'/diary-shell.html');await page.locator('.md-diary').waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'fr');assert.equal(await page.getByText('Food',{exact:true}).count(),1);assert.equal(await page.getByText('Password',{exact:true}).count(),1);
  await page.locator('#settings-tab').click();await page.getByRole('button',{name:'Stockage sur l’appareil',exact:true}).click();await page.locator('[data-storage-refresh]').waitFor();
  await page.evaluate(async()=>{await(await import('/offline-store.js')).lockOfflineAccount();});await page.waitForURL('**/login');await page.goto(host.origin+'/diary-shell.html');await page.getByText('Sign in online to open the diary on this device.',{exact:true}).waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'pt-BR');assert.equal(await page.getByText('Password',{exact:true}).count(),0);assert.equal(await page.locator('.md-diary').count(),0);
  owner='second';await page.goto(host.origin+'/diary');await page.locator('.md-diary').waitFor();await page.goto(host.origin+'/diary-shell.html');await page.locator('.md-diary').waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'de');assert.equal(await page.getByText('Password',{exact:true}).count(),0);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await host.close();}
});

test('localized reminders keep user schedule names while controls follow the active account language',async()=>{
 const data={configured:true,publicKey:'',paused:true,revision:0,schedules:[],devices:[],recent:[],groups:['Lunch'],weightMetrics:[]};const host=await fixture({current:async()=>({id:'fixture'}),reminders:async()=>data,saveReminder:async(_secret,input)=>{data.schedules=[{...input.schedule,id:'saved'}];data.revision++;return data;}});let browser;
 try{browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const page=await browser.newPage({locale:'en',viewport:{width:412,height:915},extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(host.origin+'/login');
  await page.evaluate(async()=>{const {applyAppLanguage}=await import('/app-language.js');applyAppLanguage('fr');const {mountReminders}=await import('/reminders.js');window.reminders=mountReminders({root:document.querySelector('#app')});});await page.getByRole('button',{name:'Ajouter un rappel',exact:true}).click();await page.locator('[name=label]').fill('Breakfast');await page.locator('[name=foodScope]').selectOption('group:Lunch');assert.equal(await page.locator('[name=foodScope] option:checked').textContent(),'Aucun aliment dans Lunch');await page.locator('[data-reminder-form] [type=submit]').click();await page.getByRole('status').filter({hasText:accountCloudMessages.fr['accountCloud.savedRemindersRemainPaused']}).waitFor();assert.equal(data.schedules[0].label,'Breakfast');assert.equal(await page.getByText('Breakfast',{exact:true}).count(),1);
  await page.evaluate(async()=>{window.reminders.dispose();const {applyAppLanguage}=await import('/app-language.js');applyAppLanguage('de');const {mountReminders}=await import('/reminders.js');window.reminders=mountReminders({root:document.querySelector('#app')});});await page.getByRole('button',{name:'Erinnerung hinzufügen',exact:true}).waitFor();assert.equal(await page.getByText('Breakfast',{exact:true}).count(),1);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await host.close();}
});


test('signup requires matching passwords and sends only one password to registration',async()=>{
 const submissions=[];const host=await fixture({register:async input=>{submissions.push(input);throw {code:409};}});let browser;
 try{browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});
  for(const locale of ['en','fr','de','pt-BR']){
   const context=await browser.newContext({locale,viewport:{width:412,height:915}}),page=await context.newPage();page.setDefaultTimeout(5000);
   await page.goto(host.origin+'/register');const confirm=page.getByLabel(accountCloudMessages[locale]['accountCloud.confirmPassword'],{exact:true});await confirm.waitFor();
   assert.equal(await confirm.getAttribute('type'),'password');assert.equal(await confirm.getAttribute('autocomplete'),'new-password');
   await page.locator('[name=name]').fill('Example');await page.locator('[name=email]').fill('example@example.com');await page.locator('[name=password]').fill('fixture-password');
   const before=submissions.length;await page.locator('[type=submit]').click();assert.equal(await confirm.evaluate(el=>el.validity.valueMissing),true);assert.equal(submissions.length,before);
   await confirm.fill('different-password');await page.locator('[type=submit]').click();await page.getByRole('status').filter({hasText:accountCloudMessages[locale]['accountCloud.passwordsDoNotMatch']}).waitFor();assert.equal(submissions.length,before);assert.equal(await confirm.evaluate(el=>el===document.activeElement),true);
   await confirm.fill('fixture-password');await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/auth/register')),page.locator('[type=submit]').click()]);
   assert.equal(submissions.length,before+1);assert.deepEqual(submissions.at(-1),{name:'Example',email:'example@example.com',password:'fixture-password'});
   await page.goto(host.origin+'/login');assert.equal(await page.locator('[name=confirmPassword]').count(),0);await context.close();
  }
 }finally{await browser?.close();await host.close();}
});
