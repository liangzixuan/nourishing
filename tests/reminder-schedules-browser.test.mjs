import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {parseReminderSchedule} from '../server/reminder-schedules.mjs';

test('schedule editor saves preferences paused and requires explicit resume, with conditional fields',async()=>{
 const metric={kind:'biometric',type:'Weight',unit:'kg'},data={configured:true,publicKey:Buffer.alloc(65,1).toString('base64url'),paused:true,resumedAt:null,revision:0,schedules:[],groups:['Breakfast','Lunch'],weightMetrics:[{metric,name:'Weight',unit:'kg'}],devices:[{id:'device',currentOrigin:true}],recent:[]},writes=[];let loseReply=false;
 const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){res.setHeader('Content-Type','text/html');return res.end(`<link rel="stylesheet" href="/reminders.css"><div id="panel"></div><script type="module">import {mountReminders} from '/reminders.js';const content=document.querySelector('#panel');mountReminders({root:content,notifications:location.search==='?notifications'});</script>`);}
  if(path.startsWith('/api/reminders')){
   res.setHeader('Content-Type','application/json');if(req.method==='POST'){
    let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw);writes.push({path,input});assert.equal(input.revision,data.revision);
    if(path.endsWith('/schedule')){const previous=data.schedules.find(row=>row.id===input.schedule.id),saved=parseReminderSchedule(input.schedule,{previous});if(previous)data.schedules=data.schedules.map(row=>row.id===saved.id?saved:row);else data.schedules.push(saved);}
    else if(path.endsWith('/delete'))data.schedules=data.schedules.filter(row=>row.id!==input.id);
    else if(path.endsWith('/settings'))data.paused=input.paused;
    data.revision++;if(loseReply){loseReply=false;res.writeHead(503);return res.end(JSON.stringify({error:'Reply lost'}));}
   }
   return res.end(JSON.stringify(data));
  }
  const name=path.slice(1),file=new URL('../public/'+name,import.meta.url);if(!/^[\w./-]+\.(m?js|css)$/.test(name)||!existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',/\.m?js$/.test(name)?'text/javascript':'text/css');res.end(readFileSync(file));
 }catch(error){res.writeHead(500).end(JSON.stringify({error:error.message}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const page=await browser.newPage({viewport:{width:412,height:915}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button',{name:'Add reminder',exact:true}).click();await page.getByLabel('Name',{exact:true}).fill('Breakfast');await page.getByLabel('Send when').selectOption('group:Breakfast');await page.getByRole('button',{name:'Save reminder',exact:true}).click();await page.getByText('Saved. Reminders remain paused.',{exact:true}).waitFor();
  assert.equal(data.paused,true);assert.deepEqual(writes[0].input.schedule.foodCondition,{group:'Breakfast'});assert.equal(writes.some(row=>row.path.endsWith('/settings')),false);const id=data.schedules[0].id;
  await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Type',{exact:true}).selectOption('weight');assert.equal(await page.getByLabel('Send when').isVisible(),false);await page.getByLabel('Weight metric').selectOption(JSON.stringify(metric));await page.getByLabel('Time',{exact:true}).fill('19:15');await page.getByRole('button',{name:'Save reminder',exact:true}).click();await page.getByRole('button',{name:'Resume reminders',exact:true}).waitFor();assert.equal(data.schedules.length,1);assert.equal(data.schedules[0].id,id);assert.equal(data.schedules[0].foodCondition,null);assert.deepEqual(data.schedules[0].weightMetric,metric);
  await page.getByRole('button',{name:'Resume reminders',exact:true}).click();await page.getByRole('button',{name:'Pause reminders',exact:true}).waitFor();assert.equal(data.paused,false);
  await page.getByRole('button',{name:'Pause reminders',exact:true}).click();await page.getByRole('button',{name:'Resume reminders',exact:true}).waitFor();assert.equal(data.paused,true);
  await page.getByRole('button',{name:'Delete',exact:true}).click();await page.getByRole('button',{name:'Delete reminder',exact:true}).click();await page.getByText('Reminder deleted.',{exact:true}).waitFor();assert.equal(data.schedules.length,0);assert.deepEqual(errors,[]);
  await page.getByRole('button',{name:'Add reminder',exact:true}).click();
  await page.getByLabel('Name',{exact:true}).fill('Lunch');await page.getByLabel('Send when').selectOption('group:Lunch');await page.getByLabel('Time',{exact:true}).fill('18:45');loseReply=true;
  await page.getByRole('button',{name:'Save reminder',exact:true}).click();await page.getByRole('status').filter({hasText:'Reply lost'}).waitFor();
  await page.getByRole('button',{name:'Reload',exact:true}).last().click();await page.getByRole('button',{name:'Edit',exact:true}).waitFor();
  assert.equal(data.schedules.length,1);assert.equal(data.schedules[0].time,'18:45');assert.deepEqual(data.schedules[0].foodCondition,{group:'Lunch'});
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
