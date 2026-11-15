// Exercise the built SSR adapter and its packaged worker with local, synthetic data only.
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {readFileSync, writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {MockAgent, getGlobalDispatcher, setGlobalDispatcher} from 'undici';

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
const env = {APPWRITE_ENDPOINT: 'https://appwrite.fixture.invalid/v1', APPWRITE_PROJECT_ID: 'fixture', PUBLIC_ORIGIN: 'https://nourishing.fixture.invalid', ASTRO_NODE_AUTOSTART: 'disabled'};
const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));Object.assign(process.env, env);
const dispatcher = getGlobalDispatcher(), mock = new MockAgent();mock.disableNetConnect();mock.enableNetConnect(/^127\.0\.0\.1:\d+$/);setGlobalDispatcher(mock);
const remote = mock.get('https://appwrite.fixture.invalid');let authenticated = 0;
remote.intercept({method: 'GET', path: '/v1/account'}).reply(() => {authenticated++;return {statusCode: 200, data: {$id: 'fixture-owner', email: 'fixture@example.com', name: 'Fixture', emailVerification: true}, responseOptions: {headers: {'content-type': 'application/json'}}};}).persist();
remote.intercept({method: 'GET', path: '/v1/tablesdb/nourishing/tables/profiles/rows/fixture-owner'}).reply(200, {$id: 'fixture-owner', timeZone: 'UTC', units: 'metric'}, {headers: {'content-type': 'application/json'}}).persist();
let server;
try {
  const {__verifyParseRecipe: parseRecipe} = await import(parentUrl);
  const html = '<script type="application/ld+json">' + JSON.stringify({'@context': 'https://schema.org', '@type': 'Recipe', name: 'Fixture Rice', recipeYield: '2 servings', recipeIngredient: ['100 g white rice'], recipeInstructions: 'Cook.'}) + '</script>';
  const recipe = await parseRecipe(html, 'https://example.com/recipe');
  assert.equal(recipe.name, 'Fixture Rice');assert.equal(recipe.servings, 2);assert.equal(recipe.ingredients.length, 1);assert.ok(recipe.jsonldSource);
  await assert.rejects(() => parseRecipe(html.replace('https://schema.org', 'https://untrusted.example/context'), 'https://example.com/recipe'), /External JSON-LD contexts/);
  hooks.deregister();
  const {handler, options} = await import(new URL('entry.mjs', build));assert.equal(options.bodySizeLimit, 20_000_000);
  server = createServer(handler);await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, results = [];
  const widgetRoot=await fetch(origin+'/?widget=food',{redirect:'manual'});
  assert.equal(widgetRoot.status,200);assert.equal(widgetRoot.headers.get('location'),null);
  assert.match(await widgetRoot.text(),/src="\/account\.js"/);
  async function post(path, bytes, expected, {signed = true, requestOrigin = env.PUBLIC_ORIGIN, message} = {}) {
    const started=performance.now(),body = JSON.stringify({padding: 'x'.repeat(bytes)}), response = await fetch(origin + path, {method: 'POST', headers: {origin: requestOrigin, 'content-type': 'application/json', ...(signed ? {cookie: '__Host-nourishing_session=fixture-session'} : {})}, body,signal:AbortSignal.timeout(15000)});
    const value = await response.json();assert.equal(response.status, expected, JSON.stringify({path, bytes, status: response.status, value}));
    if (message) assert.equal(value.error, message);assert.equal(response.headers.get('cache-control'), 'no-store');results.push({path, requestBytes: Buffer.byteLength(body), status: response.status,elapsedMs:Math.round(performance.now()-started)});
  }
  await post('/api/photos/save', 1024 * 1024, 400, {message: 'Invalid photo fields.'});
  await post('/api/health-connect/import?summary=1', 18_000_000, 409, {message: 'Preview this export again.'});
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
  assert.ok(authenticated >= 5);
  const report = {status: 'passed', actualBuiltServer: true, unchangedWorkerAssets: true, actualBuiltRecipeParser: true, remoteCalls: 0, routes: results};
  writeFileSync(new URL('../.local/built-boundaries-verification.json', import.meta.url), JSON.stringify(report, null, 2));console.log(JSON.stringify(report));
} finally {
  hooks.deregister();if (server) {server.closeAllConnections();await new Promise(resolve => server.close(resolve));}
  setGlobalDispatcher(dispatcher);await mock.close();for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
}
