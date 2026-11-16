import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {initialState} from '../server/domain/workspace.mjs';
import {applyWorkspaceCommand} from '../server/workspace-commands.mjs';
import {chartSurfaceView,dashboardPinnedCharts} from '../server/dashboard-pinned-charts.mjs';
import {digest} from '../server/data-codec.mjs';
test('mobile chart settings persist pin, hidden visibility, ranges and units; custom source survives editing',async()=>{
 const state=initialState(),to='2026-11-15',clock={now:new Date(to+'T18:00:00Z'),timeZone:'UTC'},commands=[];
 state.charts=[{version:2,id:'weight',name:'Archived weight',primary:{kind:'biometric',type:'Weight',unit:'kg'},secondary:null,days:2,visible:false,cycleOverlay:false}];
 const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost'),path=url.pathname;
  try{if(path==='/api/charts'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(chartSurfaceView(state,Object.fromEntries(url.searchParams),clock)));}
   if(path==='/api/workspace/command'){let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw);assert.equal(input.revision,digest(state));applyWorkspaceCommand(state,{type:input.type,payload:input.payload});commands.push(input);res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true}));}
   if(path==='/'){res.setHeader('Content-Type','text/html');return res.end(`<style>body{--ink:#eee;--line:#444;--mcl-fasting:#223}#sheet{position:fixed;inset:0;background:#223;overflow:auto}#sheet:empty{display:none}.field-row{display:flex;justify-content:space-between;padding:8px}.chart-canvas{height:180px}button,input,select{min-height:30px}</style><main id="page"></main><div id="sheet"></div><script type="module">import {mountCharts} from '/charts.js';const content=document.querySelector('#sheet');window.charts=mountCharts({page:document.querySelector('#page'),date:()=>${JSON.stringify(to)},content,header:title=>'<h1>'+title+'</h1>',show:html=>content.innerHTML=html,close:()=>content.innerHTML='',onChange:()=>{}});</script>`);}
   if(!/^\/[a-zA-Z0-9/_.-]+\.(?:js|mjs|css)$/.test(path)||path.includes('..'))return res.writeHead(404).end();res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(new URL('../public'+path,import.meta.url)));
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:412,height:915}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button',{name:'Manage',exact:true}).click();await page.locator('[data-manage-chart="custom:weight"]').click();await page.getByLabel('Pin to Dashboard').check();await page.getByLabel('Date range').selectOption('custom');await page.getByLabel('From',{exact:true}).fill('2026-11-10');await page.getByLabel('To',{exact:true}).fill(to);await page.getByLabel('Primary unit').selectOption('lbs');await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#sheet').childElementCount);
  assert.equal(state.charts[0].visible,false);let pinned=dashboardPinnedCharts(state,to,clock);assert.equal(pinned.cards[0].series[0].unit,'lbs');assert.equal(pinned.cards[0].range.from,'2026-11-10');
  await page.getByRole('button',{name:'Manage',exact:true}).click();await page.locator('[data-manage-chart="custom:weight"]').click();await page.getByRole('button',{name:'Edit name and metrics'}).click();assert.equal(await page.getByLabel('Primary metric').inputValue(),JSON.stringify(state.charts[0].primary));await page.getByLabel('Chart name').fill('My weight');await page.getByLabel('Show in Charts').check();await page.getByLabel('Show cycle').check();await page.getByRole('button',{name:'Save',exact:true}).click();await page.locator('[data-chart-open="custom:weight"]').waitFor();assert.equal(state.charts[0].name,'My weight');assert.equal(state.charts[0].cycleOverlay,true);assert.deepEqual(state.charts[0].primary,{kind:'biometric',type:'Weight',unit:'kg'});
  await page.locator('[data-chart-open="custom:weight"]').click();await page.getByLabel('Pin to Dashboard').uncheck();await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#sheet').childElementCount);assert.equal(dashboardPinnedCharts(state,to,clock).cards.length,0);
  await page.waitForFunction(()=>Object.keys(window.Chart?.instances??{}).length>0);const plot=await page.evaluate(()=>Object.values(window.Chart.instances).find(chart=>chart.canvas.dataset.chartPlot==='custom:weight')?.data.datasets[0].data);assert.ok(plot.length>0);assert.equal(plot.every(p=>p.y===null),true);assert.equal(commands.length,3);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
