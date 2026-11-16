import {diaryCalendarView} from '../server/diary-calendar-view.mjs';
import {displayView} from '../server/display-settings.mjs';
import {diarySummaryPresentation} from '../server/diary-summary.mjs';
import {diaryToolsPresentation} from '../server/diary-tools.mjs';
import {targetPolicyView,previewTargetPolicy,previewMacroTemplate} from '../server/target-policy-view.mjs';
import {barcodeAssets} from './package-barcode-assets.mjs';
import {dashboardView} from '../server/dashboard-view.mjs';
// Exercises production HTTP, domain commands and UI. Appwrite is verified separately.
import {createServer} from 'node:http';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {createHandler} from '../server/http.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {applyWorkspaceCommand} from '../server/workspace-commands.mjs';
import {calculateSummary,entryFacts} from '../server/domain/nutrition.mjs';
import {digest} from '../server/data-codec.mjs';
import {nutrientTargetsView,targetView,reportView} from '../server/nutrition-views.mjs';
import {targetsBrowserFlow} from './targets-browser-flow.mjs';
const state=initialState(),date='2026-11-14';state.foods.push({id:'fixture',name:'Fixture food',grams:100,serving:'100 g',nutrients:{calories:200,protein:10}});applyWorkspaceCommand(state,{type:'entry.add',payload:{date,foodId:'fixture',quantity:100,unit:'g',group:'Lunch'}});
const assets=new Map();for(const name of readdirSync('public',{recursive:true}))if(/\.(html|js|mjs|css|svg|woff2)$/.test(name)&&statSync('public/'+name).isFile())assets.set('/'+name.replaceAll('\\','/'),{body:readFileSync('public/'+name),type:/\.m?js$/.test(name)?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.woff2')?'font/woff2':'text/html'});assets.set('/diary',assets.get('/diary.html'));
for(const asset of await barcodeAssets())assets.set('/'+asset.path,asset);
const service={diaryCalendar:async(_,input)=>diaryCalendarView(state,input,{now:new Date(),timeZone:'UTC'}),display:async()=>displayView(state),current:async()=>({id:'fixture'}),dashboard:async(_,date)=>dashboardView(state,{date},{now:new Date(),timeZone:'UTC'}),readDiary:async(_,day)=>diaryToolsPresentation(state,{date:day,theme:state.settings.theme,revision:digest(state),groups:state.settings.groups,completed:false,entries:state.entries.filter(r=>r.date===day).map(r=>({...r,facts:entryFacts(state,r)})),notes:[],biometrics:[],summary:calculateSummary(state,day),presentation:diarySummaryPresentation(state,calculateSummary(state,day),{now:new Date(),timeZone:'UTC'})}),nutrientTargets:async(_,day)=>nutrientTargetsView(state,day),targetTemplatePreview:async(_,input)=>previewMacroTemplate(state,input),previewTargetPolicy:async(_,input)=>previewTargetPolicy(state,input,{today:date}),targetPolicies:async(_,day)=>targetPolicyView(state,day,{today:date}),targets:async(_,day)=>targetView(state,day),nutritionReport:async(_,options)=>reportView(state,options),workspaceCommand:async(_,input)=>{if(input.revision!==digest(state))throw Object.assign(Error('Refresh targets and try again.'),{code:409,publicMessage:'Refresh targets and try again.'});applyWorkspaceCommand(state,{type:input.type,payload:input.payload});return {ok:true,revision:digest(state)};}};
let handler;const server=createServer((req,res)=>handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;handler=createHandler({config:{origin},service,assets});let browser;
try{browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});await context.setExtraHTTPHeaders({Cookie:'__Host-nourishing_session=fixture'});const page=await context.newPage();console.log(JSON.stringify({checks:await targetsBrowserFlow(page,origin)}));}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
