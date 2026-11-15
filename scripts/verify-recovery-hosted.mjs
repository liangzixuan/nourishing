// Hosted Previous versions flow. Only this run's disposable records are changed.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {ID,Query} from 'node-appwrite';
import {chromium} from 'playwright-core';
import sharp from 'sharp';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';
import {backupManifest,backupReferences} from '../server/backup.mjs';
import {normalizePhoto,validateStoredPhoto} from '../server/domain/photo-images.mjs';
import {act} from '../server/domain/workspace.mjs';
import {rowId} from '../server/data-codec.mjs';
const origin='https://nourishing-cloud.appwrite.network',{users,db,storage}=fixtureOperator(),fixture=ID.unique(),fileIds=[],cleanupFailures=[],report={at:new Date().toISOString(),origin,checks:[]};
const args=(tableId,id)=>({databaseId,tableId,rowId:id}),ledger='.local/recovery-hosted-fixture.json';let created=false,browser,page,phase='owner head snapshot',ownerId,ownerBefore;
const remember=()=>writeFileSync(ledger,JSON.stringify({fixture,created,fileIds,removed:report.fixtureRemoved??false,cleanupFailures}));remember();
const headIdentity=head=>({generation:head.generation,digest:head.digest,updatedAt:head.$updatedAt});
try{
 ownerId=JSON.parse(readFileSync(new URL('../.local/migration-destination.json',import.meta.url),'utf8').replace(/^\uFEFF/,'')).accountId;assert.equal(typeof ownerId,'string');assert.ok(ownerId);ownerBefore=headIdentity(await db.getRow(args('workspace_heads',ownerId)));
 phase='create fixture';await users.create({userId:fixture,email:`recovery-ui-${fixture}@example.com`,password:randomUUID()+'Aa1!',name:'Recovery UI fixture'});created=true;remember();const session=await users.createSession({userId:fixture});
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});await context.addCookies([{name:'__Host-nourishing_session',value:session.secret,url:origin+'/',secure:true,httpOnly:true,sameSite:'Lax'}]);
 async function api(path,body){const response=body?await context.request.post(origin+path,{headers:{Origin:origin},data:body}):await context.request.get(origin+path);assert.equal(response.status(),200,`${path} status ${response.status()}`);return response.json();}
 const base=(await api('/api/backup/export')).manifest.workspace,normalized=await normalizePhoto('data:image/png;base64,'+(await sharp({create:{width:24,height:28,channels:3,background:'#92a883'}}).png().toBuffer()).toString('base64')),photo=await validateStoredPhoto(normalized),first=structuredClone(base),second=structuredClone(base);
 act(first,'note.add',{date:'2026-11-14',text:'Retained hosted photo'});first.notes.at(-1).imageId=photo.id;act(second,'note.add',{date:'2026-11-14',text:'Current hosted note'});
 const media=backupReferences(first).map(ref=>({...ref,bytes:photo.bytes.length,width:photo.width,height:photo.height}));for(const ref of media)fileIds.push(rowId(fixture,ref.namespace,ref.id));remember();
 async function seed(state,images){const current=await api('/api/backup/export'),review=await api('/api/backup/inspect',{manifest:backupManifest(state,images),revision:current.revision});for(const ref of images)await api('/api/backup/media',{reviewToken:review.reviewToken,namespace:ref.namespace,photo:{id:photo.id,dataUrl:normalized.dataUrl}});await api('/api/backup/restore',{requestId:randomUUID(),reviewToken:review.reviewToken,confirmation:'replace'});}
 phase='seed retained and active versions';await seed(first,media);const firstHead=await db.getRow(args('workspace_heads',fixture));await seed(second,[]);const current=await api('/api/backup/export');
 phase='hosted previous versions navigation';page=await context.newPage();page.setDefaultTimeout(30000);const errors=[],failed=[];page.on('pageerror',()=>errors.push('Browser error'));page.on('response',response=>{if(new URL(response.url()).origin===origin&&response.url().includes('/api/')&&response.status()>=400)failed.push({status:response.status(),path:new URL(response.url()).pathname});});const button=name=>page.getByRole('button',{name,exact:true});
 await page.goto(origin+'/diary');await page.locator('.calorie-summary').waitFor();await button('Settings').click();await button('Backup & Restore').click();await button('Previous versions').click();await page.getByRole('heading',{name:'Previous versions',exact:true}).waitFor();const inventory=await api('/api/backup/recoveries'),index=inventory.generations.filter(row=>row.status==='available').findIndex(row=>row.generation===firstHead.generation);assert.ok(index>=0);
 await button('Review').nth(index).click();await button('Replace workspace').waitFor();await page.screenshot({path:'.local/recovery-hosted-review.png'});assert.equal((await api('/api/backup/export')).revision,current.revision);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
 phase='cancel reviewed recovery';await button('Cancel').click();assert.equal((await api('/api/backup/export')).revision,current.revision);await button('Previous versions').click();await button('Review').nth(index).click();await button('Replace workspace').waitFor();
 phase='confirm recovery';await button('Replace workspace').click();await page.getByText('Backup restored.',{exact:true}).waitFor();const after=await api('/api/backup/export');assert.deepEqual(after.manifest.workspace.notes,first.notes);assert.equal(after.manifest.media.length,1);const photoResponse=await context.request.get(origin+'/api/media?'+new URLSearchParams({namespace:media[0].namespace,id:media[0].id}));assert.equal(photoResponse.status(),200);assert.deepEqual(await photoResponse.body(),photo.bytes);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 phase='owner head unchanged';assert.deepEqual(headIdentity(await db.getRow(args('workspace_heads',ownerId))),ownerBefore);report.checks.push('hosted Settings > Backup & Restore > Previous versions','retained photo version reviewed without changing active data','Cancel keeps current workspace','Replace workspace restores notes and exact photo bytes','mobile layout and no browser/API errors','real owner head unchanged');report.status='passed';
}catch(error){report.status='failed';report.failure={phase,name:error.name==='AssertionError'?'AssertionError':'OperationError',code:Number.isInteger(error.code)?error.code:null};await page?.screenshot({path:'.local/recovery-hosted-failure.png'}).catch(()=>{});process.exitCode=1;}
finally{
 await browser?.close();const clean=async(resource,operation)=>{try{await operation();}catch(error){if(error.code!==404)cleanupFailures.push({resource,code:Number.isInteger(error.code)?error.code:null});}};
 if(created){for(const tableId of ['workspace_recoveries','backup_reviews','health_reviews','command_receipts','workspace_media','workspace_records']){let rows=[];await clean(tableId+':list',async()=>{rows=await allRows(db,tableId,[Query.equal('ownerId',fixture)]);});for(const row of rows)if(row.ownerId===fixture)await clean(tableId,()=>db.deleteRow(args(tableId,row.$id)));}for(const tableId of ['workspace_heads','profiles'])await clean(tableId,()=>db.deleteRow(args(tableId,fixture)));for(const fileId of fileIds)await clean('private-media',()=>storage.deleteFile({bucketId:'private-media',fileId}));await clean('account',()=>users.delete({userId:fixture}));await clean('account:verify',async()=>{try{await users.get({userId:fixture});throw Object.assign(Error('Account remains'),{code:409});}catch(error){if(error.code!==404)throw error;}});}
 report.fixtureRemoved=cleanupFailures.length===0;if(!report.fixtureRemoved)process.exitCode=1;remember();writeFileSync('.local/recovery-hosted-verification.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report));
