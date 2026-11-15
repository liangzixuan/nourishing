// Exercise the built SSR adapter and its packaged worker with local, synthetic data only.
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {readFileSync, writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {MockAgent, getGlobalDispatcher, setGlobalDispatcher} from 'undici';
import {installLifecycleHttpMock} from '../tests/fixtures/lifecycle-http.mjs';

const build = new URL('../dist/server/', import.meta.url), manifest = JSON.parse(readFileSync(new URL('recipe-worker-manifest.json', build), 'utf8'));
for (const asset of manifest.assets) {
  const name = asset.split('/').at(-1);
  assert.deepEqual(readFileSync(new URL(asset, build)), readFileSync(new URL('../server/domain/' + name, import.meta.url)), `${name} changed during packaging`);
}
const parentUrl = new URL(manifest.parent, build).href;
assert.match(readFileSync(new URL(parentUrl), 'utf8'), /async function parseRecipe\(/);
// Expose the existing private function only in this verification process. Its actual
// built module URL stays unchanged, so Worker resolves its deployed adjacent assets.
const hooks = registerHooks({load(url, context, next) {
  const result = next(url, context);
  if (url === parentUrl) return {...result, source: Buffer.from(result.source).toString('utf8') + '\nexport {parseRecipe as __verifyParseRecipe};\n'};
  return result;
}});
const env = {APPWRITE_ENDPOINT: 'https://appwrite.fixture.invalid/v1', APPWRITE_PROJECT_ID: 'fixture', APPWRITE_API_KEY:'fixture-server-key', PUBLIC_ORIGIN: 'https://nourishing.fixture.invalid', ASTRO_NODE_AUTOSTART: 'disabled'};
const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));Object.assign(process.env, env);
const dispatcher = getGlobalDispatcher(), mock = new MockAgent();mock.disableNetConnect();mock.enableNetConnect(/^127\.0\.0\.1:\d+$/);setGlobalDispatcher(mock);
const remote = mock.get('https://appwrite.fixture.invalid');let authenticated = 0;
remote.intercept({method: 'GET', path: '/v1/account'}).reply(() => {authenticated++;return {statusCode: 200, data: {$id: 'fixture-owner', email: 'fixture@example.com', name: 'Fixture', emailVerification: true}, responseOptions: {headers: {'content-type': 'application/json'}}};}).persist();
remote.intercept({method: 'GET', path: '/v1/tablesdb/nourishing/tables/profiles/rows/fixture-owner'}).reply(200, {$id: 'fixture-owner', timeZone: 'UTC', units: 'metric'}, {headers: {'content-type': 'application/json'}}).persist();
const lifecycle=installLifecycleHttpMock(remote);let forbiddenDeletes=0;
remote.intercept({method:'GET',path:'/v1/tablesdb/nourishing/tables/account_deletions/rows/11111111-1111-4111-8111-111111111111'}).reply(404,{code:404,type:'row_not_found',message:'Fixture receipt does not exist.'},{headers:{'content-type':'application/json'}}).persist();
// Settled operation receipts are handled above. No rejected request may delete data or users.
remote.intercept({method:'DELETE',path:/.*/}).reply(()=>{forbiddenDeletes++;return {statusCode:500,data:'Unexpected deletion'};}).persist();
let server;
try {
  const {__verifyParseRecipe: parseRecipe} = await import(parentUrl);
  const html = '<script type="application/ld+json">' + JSON.stringify({'@context': 'https://schema.org', '@type': 'Recipe', name: 'Fixture Rice', recipeYield: '2 servings', recipeIngredient: ['100 g white rice'], recipeInstructions: 'Cook.'}) + '</script>';
  const recipe = await parseRecipe(html, 'https://example.com/recipe');
  assert.equal(recipe.name, 'Fixture Rice');assert.equal(recipe.servings, 2);assert.equal(recipe.ingredients.length, 1);assert.ok(recipe.jsonldSource);
  await assert.rejects(() => parseRecipe(html.replace('https://schema.org', 'https://untrusted.example/context'), 'https://example.com/recipe'), /External JSON-LD contexts/);
  hooks.deregister();
  const {handler, options} = await import(new URL('entry.mjs', build));assert.equal(options.bodySizeLimit, 0);
  server = createServer(handler);await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, results = [];
  const widgetRoot=await fetch(origin+'/?widget=food',{redirect:'manual'});
  assert.equal(widgetRoot.status,200);assert.equal(widgetRoot.headers.get('location'),null);
  assert.match(await widgetRoot.text(),/src="\/account\.js"/);
  async function post(path, bytes, expected, {signed = true, requestOrigin = env.PUBLIC_ORIGIN, message,payload,receipt} = {}) {
    const cookie=[signed?'__Host-nourishing_session=fixture-session':'',receipt??''].filter(Boolean).join('; ');
    const started=performance.now(),body = JSON.stringify(payload??{padding: 'x'.repeat(bytes)}), response = await fetch(origin + path, {method: 'POST', headers: {origin: requestOrigin, 'content-type': 'application/json', ...(cookie ? {cookie} : {})}, body,signal:AbortSignal.timeout(15000)});
    const value = await response.json();assert.equal(response.status, expected, JSON.stringify({path, bytes, status: response.status, value}));
    if (message) assert.equal(value.error, message);assert.equal(response.headers.get('cache-control'), 'no-store');results.push({path, requestBytes: Buffer.byteLength(body), status: response.status,elapsedMs:Math.round(performance.now()-started)});
  }
  for(const path of ['/api/health-connect/preview?summary=1','/api/health-connect/import?summary=1','/api/health-connect/export/biometric/preview','/api/health-connect/reconcile/apply'])await post(path,0,404,{payload:{},message:'Not found.'});
  for(const path of ['/api/home-widgets','/api/health-connect/export/intake/options','/api/health-connect/reconcile/receipt']){
    const response=await fetch(origin+path);assert.equal(response.status,404);assert.equal(response.headers.get('cache-control'),'no-store');results.push({path,status:response.status});
  }
  await post('/api/photos/save', 1024 * 1024, 400, {message: 'Invalid photo fields.'});
  await post('/api/photos/save', 1024 * 1024, 401, {signed: false});
  await post('/api/photos/save', 1024 * 1024, 403, {requestOrigin: 'https://other.fixture.invalid'});
  await post('/api/photos/save', 5 * 1024 * 1024, 413, {message: 'Request too large.'});
  await post('/api/photos/analyze', 12 * 1024 * 1024, 413, {message: 'Request too large.'});
  await post('/api/recipe-import/preview', 16 * 1024 * 1024, 413, {message: 'Request too large.'});
  await post('/api/library/command',4*1024*1024,413,{message:'Request too large.'});
  await post('/api/diary/ingredients/preview',4*1024*1024,413,{message:'Request too large.'});
  await post('/api/diary/ingredients/save',4*1024*1024,413,{message:'Request too large.'});
  const early=await new Promise((resolve,reject)=>{const started=performance.now(),req=httpRequest(origin+'/api/library/command',{method:'POST',headers:{origin:env.PUBLIC_ORIGIN,'content-type':'application/json','content-length':4194318}},response=>{response.resume();clearTimeout(timer);req.destroy();resolve({status:response.statusCode,elapsedMs:Math.round(performance.now()-started)});});const timer=setTimeout(()=>{req.destroy();reject(Error('Built SSR did not reject unsigned headers before body upload.'));},3000);req.on('error',error=>{clearTimeout(timer);reject(error);});req.flushHeaders();});assert.equal(early.status,401);results.push({path:'/api/library/command',headersOnly:true,...early});
  await post('/api/workspace/command', 20_000, 413, {message: 'Request too large.'});
  await post('/api/print-report/preview',4*1024*1024,413,{message:'Request too large.'});
  await post('/api/print-report/preview',20_000,401,{signed:false});
  await post('/api/barcode/lookup',128*1024,413,{message:'Request too large.'});
  await post('/api/barcode/save',20_000,401,{signed:false});
  await post('/api/note-photos/prepare',12*1024*1024,413,{message:'Request too large.'});
  await post('/api/note-photos/save',5*1024*1024,413,{message:'Request too large.'});
  await post('/api/note-photos/save',20_000,401,{signed:false});
  await post('/api/diary/tools/review',4*1024*1024,413,{message:'Request too large.'});
  await post('/api/diary/tools/save',20_000,401,{signed:false});
  await post('/api/nutrient-detail',4*1024*1024,413,{message:'Request too large.'});
  await post('/api/nutrition-report/nutrient',20_000,413,{message:'Request too large.'});
  const deletionReceipt='__Host-nourishing_deletion=11111111-1111-4111-8111-111111111111.'+'a'.repeat(64);
  for(const operation of ['prepare','confirm','status']){
    const path='/api/account/deletion/'+operation;
    await post(path,20_000,413,{receipt:deletionReceipt,message:'Request too large.'});
    await post(path,20_000,403,{receipt:deletionReceipt,requestOrigin:'https://other.fixture.invalid'});
    await post(path+'?ownerId=other',20_000,400,{receipt:deletionReceipt});
    if(operation!=='status')await post(path,20_000,401,{signed:false,receipt:deletionReceipt});
  }
  await post('/api/account/deletion/prepare',0,400,{payload:{password:'fixture-password',ownerId:'other'}});
  await post('/api/account/deletion/prepare',0,400,{payload:{password:'short'}});
  await post('/api/account/deletion/confirm',0,400,{payload:{confirmation:'wrong'},receipt:deletionReceipt});
  await post('/api/account/deletion/confirm',0,404,{payload:{confirmation:'delete'}});
  await post('/api/account/deletion/status',0,404,{signed:false,payload:{}});
  await post('/api/account/deletion/status',0,400,{signed:false,payload:{ownerId:'other'},receipt:deletionReceipt});
  await post('/api/account/deletion/status',0,400,{signed:false,payload:{},receipt:'__Host-nourishing_deletion=malformed'});
  await post('/api/account/deletion/status',0,403,{signed:false,payload:{},receipt:deletionReceipt});
  await post('/api/account/deletion/confirm',0,403,{payload:{confirmation:'delete'},receipt:deletionReceipt});
  const deletionEarly=await new Promise((resolve,reject)=>{const started=performance.now(),req=httpRequest(origin+'/api/account/deletion/confirm',{method:'POST',headers:{origin:env.PUBLIC_ORIGIN,'content-type':'application/json','content-length':20000}},response=>{response.resume();clearTimeout(timer);req.destroy();resolve({status:response.statusCode,elapsedMs:Math.round(performance.now()-started)});});const timer=setTimeout(()=>{req.destroy();reject(Error('Built SSR did not reject unsigned deletion headers before upload.'));},3000);req.on('error',error=>{clearTimeout(timer);reject(error);});req.flushHeaders();});assert.equal(deletionEarly.status,401);results.push({path:'/api/account/deletion/confirm',headersOnly:true,...deletionEarly});
  assert.ok(authenticated >= 5);
  assert.equal(forbiddenDeletes,0);assert.equal(lifecycle.operations.size,0);assert.equal(lifecycle.transactions.size,0);assert.equal(lifecycle.gate.state,'active');
  const report = {status: 'passed', actualBuiltServer: true, unchangedWorkerAssets: true, actualBuiltRecipeParser: true, realSdkLifecycleGate:true,forbiddenDeletes,remoteCalls: 0, routes: results};
  writeFileSync(new URL('../.local/built-boundaries-verification.json', import.meta.url), JSON.stringify(report, null, 2));console.log(JSON.stringify(report));
} finally {
  hooks.deregister();if (server) {server.closeAllConnections();await new Promise(resolve => server.close(resolve));}
  setGlobalDispatcher(dispatcher);await mock.close();for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
}
