import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {gzipSync} from 'node:zlib';
import {initialState,act} from '../server/domain/workspace.mjs';
import {parseRecipe} from '../server/domain/importers.mjs';
import {prepareRecipeReview,evaluateRecipeReview} from '../server/domain/recipe-review.mjs';
import {createInsightCatalog} from '../server/food-insights.mjs';
import {fetchPublicRecipe,isPublicRecipeAddress,publicRecipeUrl,importRecipeUrl,previewRecipeImport,prepareRecipeImportSave,prepareRecipeImportDraft,recipeImportCatalog} from '../server/recipe-import.mjs';
import {createWebHandler} from '../server/http.mjs';

const html=`<!doctype html><div itemscope itemtype="https://schema.org/Recipe"><h1 itemprop="name">Rice and beans</h1><meta itemprop="recipeYield" content="4 servings"><span itemprop="recipeIngredient">200 g white rice</span><span itemprop="recipeIngredient">100 g black beans</span><p itemprop="recipeInstructions">Mix and cook.</p></div>`;
const food=(id,name,nutrients)=>({id,name,serving:'100 g',grams:100,nutrients,source:'Fixture food'});
function setup(){const state=initialState();state.foods=[food('rice','White rice',{calories:130,protein:3,carbs:28,fat:1}),food('beans','Black beans',{calories:100,protein:8,carbs:20,fat:1})];return {state,catalog:createInsightCatalog([])};}
const response=(statusCode,body='',headers={})=>Object.assign(Readable.from([Buffer.isBuffer(body)?body:Buffer.from(body)]),{statusCode,headers});
const dns=async()=>[{address:'93.184.216.34',family:4}];

test('public recipe fetch rejects private, mapped, link-local, reserved and credential URLs before connecting',async()=>{
 for(const address of ['127.0.0.1','10.0.0.1','172.16.3.2','192.168.1.2','169.254.169.254','0.0.0.0','100.64.0.1','224.0.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','168.63.129.16'])assert.equal(isPublicRecipeAddress(address),false,address);
 for(const url of ['http://127.1','http://2130706433','http://0x7f000001','http://[::ffff:127.0.0.1]','http://user:password@example.com','file:///etc/passwd'])await assert.rejects(fetchPublicRecipe(url,{open:()=>{assert.fail('Must not connect');}}));
 await assert.rejects(fetchPublicRecipe('https://example.com',{lookup:async()=>[{address:'93.184.216.34',family:4},{address:'10.0.0.1',family:4}],open:()=>assert.fail('Must reject mixed DNS')}));
 assert.equal(publicRecipeUrl('https://example.com/recipe#section').href,'https://example.com/recipe');
});
test('public recipe fetch pins the checked resolution and validates every redirect',async()=>{
 let lookups=0,opens=0;const lookup=async host=>{lookups++;assert.equal(host,'example.com');return [{address:lookups===1?'93.184.216.34':'127.0.0.1',family:4}];};
 const open=async(url,options)=>{opens++;const addresses=await new Promise((resolve,reject)=>options.lookup(url.hostname,{all:true},(error,list)=>error?reject(error):resolve(list)));assert.deepEqual(addresses,[{address:'93.184.216.34',family:4}]);return response(302,'',{location:'/redirected'});};
 await assert.rejects(fetchPublicRecipe('https://example.com/recipe',{lookup,open}),/public internet/);assert.equal(opens,1);assert.equal(lookups,2);
 let calls=0;const redirect=await fetchPublicRecipe('https://example.com/a',{lookup:dns,open:async()=>++calls===1?response(302,'',{location:'https://other.example/recipe'}):response(200,html)});assert.equal(calls,2);assert.equal(redirect.url,'https://other.example/recipe');assert.equal(redirect.text,html);
});
test('recipe transport handles compressed pages and bounds redirects, inflated size and aborts',async()=>{
 const result=await fetchPublicRecipe('https://example.com',{lookup:dns,open:async()=>response(200,gzipSync(html),{'content-encoding':'gzip'})});assert.equal(result.text,html);
 await assert.rejects(fetchPublicRecipe('https://example.com',{lookup:dns,open:async()=>response(302,'',{location:'/again'})}),/too many/);
 await assert.rejects(fetchPublicRecipe('https://example.com',{lookup:dns,open:async()=>response(200,gzipSync(Buffer.alloc(5_000_001,65)),{'content-encoding':'gzip'})}),/5 MB/);
 await assert.rejects(fetchPublicRecipe('https://example.com',{signal:AbortSignal.abort(),lookup:()=>assert.fail('No lookup after abort')}),/timed out/);
});
test('production Microdata parser imports, matches and previews exact source quantities',async()=>{
 const {state,catalog}=setup(),before=structuredClone(state);const imported=await importRecipeUrl(state,catalog,{url:'https://example.com/recipe'},{fetchPage:async()=>({text:html,url:'https://example.com/recipe'})});
 assert.equal(imported.draft.name,'Rice and beans');assert.equal(imported.draft.servings,4);assert.equal(imported.review.canSave,true);assert.equal(imported.review.preview.perServing.calories,90);
 const saved=prepareRecipeImportSave(state,catalog,imported.draft);assert.deepEqual(saved.rows[0],{ref:{kind:'library',id:'rice'},quantity:{quantity:200,unit:'g'}});assert.equal(saved.source,'https://example.com/recipe');assert.deepEqual(state,before);
 const {rows,...recipe}=saved;act(state,'recipe.save',{...recipe,ingredients:rows.map(row=>({foodId:row.ref.id,...row.quantity}))});assert.equal(state.recipes[0].source,saved.source);assert.deepEqual(state.recipes[0].importReview.originalIngredients,imported.draft.originalIngredients);
});
test('composed preview agrees with source recipe-review on grams, yield and ambiguous quantities',async()=>{
 const {state,catalog}=setup(),adapter=recipeImportCatalog(catalog);
 for(const ingredient of ['200 g white rice','white rice to taste']){
  const source=html.replace('200 g white rice',ingredient).replace('4 servings',ingredient.includes('taste')?'2 loaves':'4 servings'),parsed=await parseRecipe(source,'https://example.com/recipe'),original=prepareRecipeReview(parsed,{foodCatalog:adapter,foods:state.foods});
  const imported=await importRecipeUrl(state,catalog,{url:'https://example.com/recipe'},{fetchPage:async()=>({text:source,url:'https://example.com/recipe'})});
  assert.deepEqual(imported.review.yieldReview,original.review.yieldReview);assert.deepEqual(imported.review.rows.map(r=>r.status),original.review.rows.map(r=>r.status));assert.deepEqual(imported.review.preview.perServing,original.review.preview.perServing);assert.deepEqual(imported.review.rows.map(r=>r.conversion),original.review.rows.map(r=>r.conversion));
  imported.draft.yieldConfirmed=true;imported.draft.servings=3;imported.draft.rows[0].override={quantity:150,unit:'g'};imported.draft.rows.forEach(r=>r.confirmed=true);
  const next=previewRecipeImport(state,catalog,imported.draft),sourceNext=evaluateRecipeReview(imported.draft,{foodCatalog:adapter,foods:state.foods});assert.equal(next.review.canSave,sourceNext.canSave);assert.deepEqual(next.review.preview.perServing,sourceNext.preview.perServing);
 }
});
test('recipe replacement, exclusions and unresolved rows retain source validation',async()=>{
 const {state,catalog}=setup(),imported=await importRecipeUrl(state,catalog,{url:'https://example.com/recipe'},{fetchPage:async()=>({text:html,url:'https://example.com/recipe'})}),draft=imported.draft;
 draft.rows[0].selection={kind:'library',id:'beans'};draft.rows[0].override={quantity:50,unit:'g'};assert.equal(previewRecipeImport(state,catalog,draft).review.canSave,false);draft.rows[0].confirmed=true;draft.rows[1].excluded=true;const next=previewRecipeImport(state,catalog,draft);assert.equal(next.review.canSave,true);assert.equal(next.review.preview.totals.protein,4);
 draft.rows[0].selection={kind:'library',id:'foreign-account'};assert.throws(()=>prepareRecipeImportSave(state,catalog,draft),/no longer available/);draft.rows[0].selection=null;assert.throws(()=>prepareRecipeImportSave(state,catalog,draft),/Check ingredient/);draft.rows[0].original='changed';assert.throws(()=>previewRecipeImport(state,catalog,draft),/order/);
});
test('production JSON-LD worker reads bundled context and never fetches external contexts',async()=>{
 const {state,catalog}=setup();const json={'@context':'https://schema.org','@type':'Recipe',name:'Rice',recipeYield:'2 servings',recipeIngredient:['100 g white rice'],recipeInstructions:'Cook.'};
 const text='<script type="application/ld+json">'+JSON.stringify(json)+'</script>';const parsed=await importRecipeUrl(state,catalog,{url:'https://example.com/recipe'},{fetchPage:async()=>({text,url:'https://example.com/recipe'})});assert.equal(parsed.draft.name,'Rice');assert.equal(parsed.review.preview.perServing.calories,65);
 json['@context']='http://169.254.169.254/private';await assert.rejects(parseRecipe(JSON.stringify(json),'https://example.com/recipe'),/External JSON-LD contexts/);
});
test('recipe HTTP routes authenticate before reading bodies and reject origin/query overrides',async()=>{
 const config={origin:'https://fixture.example'},cookie='__Host-nourishing_session=fixture';let calls=0;
 const handle=createWebHandler({config,service:{current:async()=>{calls++;throw {code:401};}}});
 for(const path of ['/api/recipe-import','/api/recipe-import/preview','/api/recipe-import/draft'])for(const [signed,origin,status] of [[false,config.origin,401],[true,'https://other.example',403],[true,config.origin,401]]){
  const req={url:config.origin+path,method:'POST',headers:new Headers({origin,'content-type':'application/json',...(signed?{cookie}:{})}),get body(){assert.fail('Unauthorized recipe body read');}};
  assert.equal((await handle(req)).status,status);
 }
 assert.equal(calls,3);
 const authorized=createWebHandler({config,service:{current:async()=>({id:'fixture'})}});assert.equal((await authorized(new Request(config.origin+'/api/recipe-import?owner=foreign',{method:'POST',headers:{origin:config.origin,'content-type':'application/json',cookie},body:'{}'}))).status,400);
});
test('recipe HTTP accepts supported long instructions, bounds bodies and uses production field validation',async()=>{
 const {state,catalog}=setup(),config={origin:'https://fixture.example'},headers={origin:config.origin,'content-type':'application/json',cookie:'__Host-nourishing_session=fixture'};
 const imported=await importRecipeUrl(state,catalog,{url:'https://example.com/recipe'},{fetchPage:async()=>({text:html,url:'https://example.com/recipe'})});
 const handle=createWebHandler({config,service:{current:async()=>({id:'fixture'}),importRecipe:async(_,input)=>importRecipeUrl(state,catalog,input,{fetchPage:async()=>({text:html,url:'https://example.com/recipe'})}),previewRecipeImport:async(_,input)=>previewRecipeImport(state,catalog,input),recipeImportDraft:async(_,input)=>prepareRecipeImportDraft(state,catalog,input)}});
 const post=(path,body)=>handle(new Request(config.origin+path,{method:'POST',headers,body:JSON.stringify(body)}));
 const long={...imported.draft,instructions:'x'.repeat(100000)};for(const [path,body] of [['/api/recipe-import/preview',long],['/api/recipe-import/draft',long]]){const result=await post(path,body);assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');}
 assert.equal((await post('/api/recipe-import',{url:'https://example.com',owner:'foreign'})).status,400);assert.equal((await post('/api/recipe-import/preview',{...long,owner:'foreign'})).status,400);
 for(const [path,limit] of [['/api/recipe-import',16*1024*1024],['/api/recipe-import/preview',16*1024*1024],['/api/recipe-import/draft',16*1024*1024]])assert.equal((await handle({url:config.origin+path,method:'POST',headers:new Headers(headers),body:(async function*(){yield Buffer.alloc(limit+1);})()})).status,413);
});

test('pasted ingredients and full recipe retain source review and prepare a detached catalog draft',async()=>{
 const {state}=setup(),catalog=createInsightCatalog([food('usda:fixture:1','White rice',{calories:130,protein:3})]),before=structuredClone(state);
 for(const input of [{ingredients:'200 g white rice\n100 g black beans'},{text:'Rice and beans\nServes 4\nIngredients\n200 g white rice\n100 g black beans\nInstructions\nMix and cook.'}]){
  const imported=await importRecipeUrl(state,catalog,input,{fetchPage:()=>assert.fail('Pasted sources must not fetch')});const draft=imported.draft;
  assert.equal(draft.originalIngredients.length,2);draft.rows[0].selection={kind:'catalog',id:'usda:fixture:1'};draft.rows.forEach(row=>row.confirmed=true);
  draft.yieldConfirmed=true;draft.sourceConfirmed=true;
  const prepared=prepareRecipeImportDraft(state,catalog,draft);assert.equal(prepared.recipe.ingredients[0].foodId,'usda:fixture:1');assert.equal(prepared.ingredients[0].name,'White rice');assert.ok(prepared.ingredients[0].options.some(row=>row[0]==='g'));assert.equal(prepared.recipe.importReview.modifiedAfterImport,false);assert.deepEqual(state,before);
  if(input.text)assert.equal(prepared.recipe.importReview.plainTextSource.text,input.text);
 }
 for(const input of [{},{text:''},{text:'x',ingredients:'y'},{ingredients:'x',owner:'foreign'},{text:4},{ingredients:'x'.repeat(5000001)}])await assert.rejects(importRecipeUrl(state,catalog,input));
});
