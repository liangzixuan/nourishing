// Hosted Snapshot child UI verification. Uses one disposable account and synthetic media only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {ID,Query} from 'node-appwrite';
import sharp from 'sharp';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';
import {rowId} from '../server/data-codec.mjs';
const origin='https://nourishing.app',directory='.local/snapshot-child-hosted';mkdirSync(directory,{recursive:true});
const {users,db,storage}=fixtureOperator(),id=ID.unique(),email=`snapshot-ui-${id}@example.com`,password=randomUUID()+'Aa1!';
const owner=JSON.parse(readFileSync('.local/migration-destination.json')).accountId,args=(tableId,rowId)=>({databaseId,tableId,rowId});
assert.notEqual(id,owner);const before=await db.getRow(args('workspace_heads',owner));
const report={at:new Date().toISOString(),origin,checks:[],fixtureRemoved:false,ownerUnchanged:false},files=new Set();let browser,page,context,created=false,primaryError;
const remember=()=>writeFileSync(`${directory}/fixture.json`,JSON.stringify({id,files:[...files],created},null,2));remember();
try{
 await users.create({userId:id,email,password,name:'Snapshot child UI hosted fixture'});created=true;remember();
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,colorScheme:'dark'});context.setDefaultTimeout(60000);
 assert.equal((await context.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{email,password}})).status(),200);
 const get=async path=>{const response=await context.request.get(origin+path);assert.equal(response.status(),200,path);return response.json();};
 const snapshots=async()=>{const view=await get('/api/snapshots');for(const row of view.items)files.add(rowId(id,'progress_photos',row.imageId));remember();return view;};
 page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>{window.cspErrors=[];document.addEventListener('securitypolicyviolation',event=>window.cspErrors.push(event.violatedDirective));});
 const button=name=>page.getByRole('button',{name,exact:true});
 const capture=async name=>{await page.evaluate(()=>Promise.all([...document.images].map(image=>image.decode())));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${directory}/${name}.png`});};
 const openSnapshots=async()=>{await page.goto(origin+'/diary');await page.locator('.md-summary').waitFor();await button('Discover').click();await page.locator('.dc-dashboard').waitFor();await button('Snapshots').click();await page.locator('.snapshot-list .ms-add').waitFor();};
 await openSnapshots();await button('Add Snapshot').click();assert.deepEqual(await page.locator('.ms-choice strong').allTextContents(),['Camera','Files']);await capture('source');await page.mouse.click(2,2);await page.locator('.ms-dialog').waitFor({state:'detached'});
 report.checks.push('source chooser uses Camera/Files and outside dismissal');
 const png=await sharp({create:{width:240,height:360,channels:3,background:'#4a796b'}}).png().toBuffer();let loseReply=true;const saveIds=[];
 await page.route('**/api/snapshots/save',async route=>{saveIds.push(route.request().postDataJSON().requestId);const response=await route.fetch();assert.equal(response.status(),200);if(loseReply){loseReply=false;await route.abort('failed');}else await route.fulfill({response});});
 await page.locator('[data-snapshot-gallery]').setInputFiles({name:'synthetic-snapshot.png',mimeType:'image/png',buffer:png});await button('Retry').waitFor();assert.equal((await snapshots()).items.length,1);await button('Retry').click();await page.locator('.snapshot-card').waitFor();await page.locator('.snapshot-status').filter({hasText:/\S/}).waitFor({state:'hidden'});assert.equal((await snapshots()).items.length,1);assert.equal(saveIds.length,2);assert.equal(saveIds[0],saveIds[1]);await page.unroute('**/api/snapshots/save');
 report.checks.push('actual browser upload and lost-response retry create one private snapshot with the same receipt ID');
 let view=await snapshots(),original=view.items[0];const seed={id:original.id,date:original.date,time:'08:30',title:'Synthetic title',note:'Original caption',vitals:{weight:{value:70,unit:'kg'},height:{value:175,unit:'cm'},age:30,bodyFat:20}};
 assert.equal((await context.request.post(origin+'/api/workspace/command',{headers:{Origin:origin},data:{requestId:randomUUID(),revision:view.revision,type:'snapshot.update',payload:seed}})).status(),200);original=(await snapshots()).items[0];await openSnapshots();await page.locator('.snapshot-card').waitFor();
 await button('Snapshot options').click();assert.deepEqual(await page.locator('.ms-choice strong').allTextContents(),['Edit Date','Edit Caption','Delete']);await capture('options');await button('Edit Caption').click();await page.locator('[data-snapshot-caption]').fill('Discard this caption');await button('Cancel').click();assert.equal((await snapshots()).items[0].note,'Original caption');
 await button('Snapshot options').click();await button('Edit Caption').click();await page.locator('[data-snapshot-caption]').fill('Hosted caption');await capture('caption');await button('Save').click();await page.locator('.ms-dialog').waitFor({state:'detached'});await page.locator('.ms-caption').filter({hasText:'Hosted caption'}).waitFor();assert.deepEqual((await snapshots()).items[0],{...original,note:'Hosted caption'});
 const chosen=new Date(original.date+'T12:00:00Z');chosen.setUTCDate(chosen.getUTCDate()-1);const changedDate=chosen.toISOString().slice(0,10);
 await button('Snapshot options').click();await button('Edit Date').click();await page.locator('[data-mdc-jump]').fill(changedDate.slice(0,7));await page.locator(`[data-mdc-date="${changedDate}"]`).click();await capture('date');await button('Cancel').click();assert.equal((await snapshots()).items[0].date,original.date);
 await button('Snapshot options').click();await button('Edit Date').click();await page.locator('[data-mdc-jump]').fill(changedDate.slice(0,7));await page.locator(`[data-mdc-date="${changedDate}"]`).click();const dateRead=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/snapshots'&&response.status()===200);await button('OK').click();await dateRead;await page.locator('.snapshot-status').filter({hasText:/\S/}).waitFor({state:'hidden'});
 assert.deepEqual((await snapshots()).items[0],{...original,note:'Hosted caption',date:changedDate});report.checks.push('caption/date save and cancel preserve title, time, measurements, image ID and creation time');
 await button('View snapshot').click();await page.locator('.ms-viewer').waitFor();await capture('viewer');await button('Back').click();await button('View snapshot').click();await page.keyboard.press('Escape');await page.locator('.ms-viewer').waitFor({state:'detached'});
 await button('Snapshot options').click();await page.evaluate(()=>window.dispatchEvent(new Event('nourishing-back',{cancelable:true})));await page.locator('.ms-sheet').waitFor({state:'detached'});await button('Snapshot options').click();await page.locator('.ms-sheet [data-discover="shell-diary"]').click();await page.locator('.md-summary').waitFor();await button('Discover').click();await page.locator('.dc-dashboard').waitFor();await button('Snapshots').click();await page.locator('.snapshot-card').waitFor();report.checks.push('fullscreen viewer, Back/Escape, native back event and bottom-navigation forwarding');
 await button('Snapshot options').click();await button('Delete').click();await capture('delete');await button('Cancel').click();assert.equal((await snapshots()).items.length,1);await button('Snapshot options').click();await button('Delete').click();await page.locator('[data-snapshot-delete]').click();await page.locator('.snapshot-empty').waitFor();assert.equal((await snapshots()).items.length,0);assert.equal((await context.request.get(origin+'/api/media?'+new URLSearchParams({namespace:'progress_photos',id:original.imageId}))).status(),404);report.checks.push('Delete cancellation preserves photo; confirmed Delete removes timeline and media access');
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.cspErrors),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));report.checks.push('no browser/CSP errors or phone-width overflow');report.status='passed';
}catch(error){primaryError=error;report.status='failed';report.error=error.message;await page?.screenshot({path:`${directory}/failure.png`}).catch(()=>{});}
finally{
 await browser?.close();
 if(created)try{
  const mediaRows=await allRows(db,'workspace_media',[Query.equal('ownerId',id)]);for(const row of mediaRows){assert.equal(row.ownerId,id);assert.equal(row.fileId,rowId(id,row.namespace,row.sourceId));files.add(row.fileId);}remember();
  for(const fileId of files){try{const file=await storage.getFile({bucketId:'private-media',fileId});assert.deepEqual(file.$permissions,[`read("user:${id}")`]);await storage.deleteFile({bucketId:'private-media',fileId});}catch(error){if(error.code!==404)throw error;}}
  for(const tableId of ['workspace_records','workspace_media','workspace_recoveries','command_receipts'])for(const row of await allRows(db,tableId,[Query.equal('ownerId',id)])){assert.equal(row.ownerId,id);await db.deleteRow(args(tableId,row.$id));}
  for(const tableId of ['workspace_heads','profiles','reminder_dispatch','fasting_dispatch'])try{await db.deleteRow(args(tableId,id));}catch(error){if(error.code!==404)throw error;}
  await users.delete({userId:id});report.fixtureRemoved=true;
 }catch(error){report.cleanupError=error.message;primaryError??=error;}
 try{assert.deepEqual(await db.getRow(args('workspace_heads',owner)),before);report.ownerUnchanged=true;}catch(error){report.ownerCheckError=error.message;primaryError??=error;}
 writeFileSync(`${directory}/result.json`,JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report));if(primaryError)throw primaryError;
