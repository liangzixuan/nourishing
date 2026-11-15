// Run only after the preview deployment includes backup routes and UI.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {ID,Query} from 'node-appwrite';
import sharp from 'sharp';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';
import {validateBackupManifest} from '../server/backup.mjs';
const origin='https://nourishing-cloud.appwrite.network',{users,db,storage}=fixtureOperator(),fixture=ID.unique(),email=`backup-browser-${fixture}@example.com`,password=randomUUID()+'Aa1!';
const owner=JSON.parse(readFileSync(new URL('../.local/migration-destination.json',import.meta.url),'utf8').replace(/^\uFEFF/,'')).accountId;
const report={at:new Date().toISOString(),checks:[]},failures=[],files=new Set(),args=(tableId,id)=>({databaseId,tableId,rowId:id});let browser,primaryError,page;
const fixturePath=new URL('../.local/backup-browser-fixture.json',import.meta.url),reportPath=new URL('../.local/backup-browser-verification.json',import.meta.url),remember=()=>writeFileSync(fixturePath,JSON.stringify({account:fixture,fileIds:[...files],cleanupFailures:failures}));remember();
try{
 const ownerBefore=await db.getRow(args('workspace_heads',owner));
 await users.create({userId:fixture,email,password,name:'Backup browser verification fixture'});
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,acceptDownloads:true});
 const post=async(path,data)=>{const response=await context.request.post(origin+path,{headers:{Origin:origin},data,timeout:90000}),body=await response.json();assert.equal(response.status(),200,path+': '+(body.error??''));return body;};
 const get=async path=>{const response=await context.request.get(origin+path,{timeout:90000}),body=await response.json();assert.equal(response.status(),200,path+': '+(body.error??''));return body;};
 await post('/api/auth/login',{email,password});let exported=await get('/api/backup/export');
 await post('/api/workspace/command',{requestId:randomUUID(),revision:exported.revision,type:'note.add',payload:{date:'2026-11-14',text:'Keep this synthetic note'}});
 const image=await sharp({create:{width:24,height:30,channels:3,background:'#92a883'}}).png().toBuffer(),prepared=await post('/api/snapshots/prepare',{dataUrl:'data:image/png;base64,'+image.toString('base64'),date:'2026-11-14',title:'Browser fixture',note:'',vitals:{}});
 await post('/api/snapshots/save',{requestId:randomUUID(),revision:prepared.revision,photo:prepared.photo,...prepared.metadata});exported=await get('/api/backup/export');
 const errors=[];page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/diary');await page.locator('.calorie-summary').waitFor();await page.locator('#settings-tab').click();await page.getByRole('button',{name:'Backup & Restore',exact:true}).click();await page.getByRole('button',{name:'Download backup',exact:true}).waitFor();
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download backup',exact:true}).click();const download=await downloaded,bundle=JSON.parse(readFileSync(await download.path(),'utf8'));
 assert.equal(bundle.media.length,1);assert.match(bundle.media[0].dataUrl,/^data:image\/jpeg;base64,/);assert.deepEqual(validateBackupManifest({...bundle,media:bundle.media.map(({dataUrl,...row})=>row)}).workspace,exported.manifest.workspace);
 await post('/api/workspace/command',{requestId:randomUUID(),revision:exported.revision,type:'note.add',payload:{date:'2026-11-14',text:'Remove this synthetic note on restore'}});const before=await db.getRow(args('workspace_heads',fixture));
 await page.locator('[data-backup-file]').setInputFiles({name:download.suggestedFilename(),mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});await page.locator('.backup-review').waitFor();await page.getByRole('button',{name:'Replace workspace',exact:true}).waitFor();
 assert.equal((await db.getRow(args('workspace_heads',fixture))).digest,before.digest);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'.local/cloud-backup-review.png'});
 await page.getByRole('button',{name:'Replace workspace',exact:true}).click();await page.getByText('Backup restored.',{exact:true}).waitFor({timeout:90000});
 const after=await db.getRow(args('workspace_heads',fixture)),restored=await get('/api/backup/export');assert.notEqual(after.generation,before.generation);assert.deepEqual(restored.manifest.workspace,bundle.workspace);assert.equal((await get('/api/account')).id,fixture);
 const recovery=await allRows(db,'workspace_records',[Query.equal('ownerId',fixture),Query.equal('generation',before.generation)]);assert.ok(recovery.some(row=>row.family==='notes'&&JSON.parse(row.payload).text==='Remove this synthetic note on restore'));
 const ownerAfter=await db.getRow(args('workspace_heads',owner));assert.equal(ownerAfter.digest,ownerBefore.digest);assert.equal(ownerAfter.generation,ownerBefore.generation);assert.equal(ownerAfter.$updatedAt,ownerBefore.$updatedAt);assert.deepEqual(errors,[]);
 report.ownerWorkspaceUnchanged=true;report.checks.push('hosted Settings backup page','downloaded complete JSON with photo bytes','review happens before replacement','explicit UI restore preserves workspace and account','old generation retained','mobile layout without overflow or browser errors');
}catch(error){primaryError=error;await page?.screenshot({path:'.local/cloud-backup-browser-failure.png'}).catch(()=>{});}finally{
 await browser?.close();const clean=async(label,work)=>{try{await work();}catch(error){if(error.code!==404)failures.push({resource:label,code:error.code??'unknown'});}};
 for(const tableId of ['backup_reviews','command_receipts','workspace_media','workspace_records']){let rows=[];await clean(`${tableId}:list`,async()=>{rows=await allRows(db,tableId,[Query.equal('ownerId',fixture)]);});for(const row of rows){assert.equal(row.ownerId,fixture);if(tableId==='workspace_media'){files.add(row.fileId);remember();}await clean(`${tableId}:${row.$id}`,()=>db.deleteRow(args(tableId,row.$id)));}}
 for(const tableId of ['workspace_heads','profiles'])await clean(`${tableId}:${fixture}`,()=>db.deleteRow(args(tableId,fixture)));await clean(`user:${fixture}`,()=>users.delete({userId:fixture}));for(const fileId of files)await clean(`image:${fileId}`,()=>storage.deleteFile({bucketId:'private-media',fileId}));
 report.fixtureRemoved=failures.length===0;remember();if(failures.length)primaryError??=Error('Backup browser fixture cleanup incomplete.');
}
report.status=primaryError?'failed':'passed';writeFileSync(reportPath,JSON.stringify(report,null,2));if(primaryError)throw primaryError;console.log(JSON.stringify(report));
