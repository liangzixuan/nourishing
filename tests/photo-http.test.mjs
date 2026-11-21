import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebHandler} from '../server/http.mjs';

const config = {origin: 'https://candidate.example'}, cookie = '__Host-nourishing_session=fixture-session';
const paths = ['/api/photos/analyze', '/api/photos/save', '/api/snapshots/prepare', '/api/snapshots/save', '/api/note-photos/prepare', '/api/note-photos/save'];
const methods = ['analyzePhoto','savePhoto','prepareSnapshot','saveSnapshot','prepareNotePhoto','saveNotePhoto'];
function request(path, {signed = true, origin = config.origin, body = '{}'} = {}) {
  return new Request(config.origin + path, {method: 'POST', headers: {origin, 'content-type': 'application/json', ...(signed ? {cookie} : {})}, body});
}

test('photo routes authenticate before reading image bodies and reject cross-origin requests', async () => {
  let accounts = 0, operations = 0;
  const handle = createWebHandler({config, service: {current: async () => {accounts++;throw {code: 401};}, analyzePhoto: async () => {operations++;}, savePhoto: async () => {operations++;}}});
  for (const path of paths) {
    for (const [signed, origin, status] of [[false, config.origin, 401], [true, 'https://other.example', 403], [true, config.origin, 401]]) {
      const real = request(path, {signed, origin});
      const guarded = {url: real.url, method: real.method, headers: real.headers, signal: real.signal, get body() {throw Error('Unauthorized image body was read');}};
      assert.equal((await handle(guarded)).status, status);
    }
  }
  assert.equal(accounts, paths.length);assert.equal(operations, 0);
});

test('photo routes bound authorized bodies, reject query overrides, and keep results private', async () => {
  const calls = [], service = {current: async secret => {assert.equal(secret, 'fixture-session');return {$id: 'fixture'};}};
  for (const method of methods) service[method] = async (secret, body, signal) => {calls.push({method, secret, body, signal});return {ok: true};};
  const handle = createWebHandler({config, service});
  for (const path of paths) {
    assert.equal((await handle(request(path + '?owner=other'))).status, 400);
    assert.equal((await handle(request(path, {body: 'invalid'}))).status, 400);
    const limit = (path.endsWith('/analyze') || path.endsWith('/prepare')) ? 12 : 5, large = request(path);
    const guarded = {url: large.url, method: large.method, headers: large.headers, signal: large.signal, body: (async function* () {yield Buffer.alloc(limit * 1024 * 1024 + 1);})()};
    assert.equal((await handle(guarded)).status, 413);
    const response = await handle(request(path, {body: JSON.stringify({image: 'fixture'})}));
    assert.equal(response.status, 200);assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(calls.length, paths.length);assert.deepEqual(calls.map(call => call.method), methods);
  for (const call of calls) {assert.equal(call.secret, 'fixture-session');assert.deepEqual(call.body, {image: 'fixture'});assert.ok(call.signal instanceof AbortSignal);}
});

test('exercise queries reject non-decimal minute and offset syntax before service invocation', async () => {
  const calls = [], handle = createWebHandler({config, service: {exerciseEstimate: async (_, input) => {calls.push(input);return input;}, exercises: async (_, input) => {calls.push(input);return input;}}});
  const get = path => new Request(config.origin + path, {headers: {cookie}});
  for (const value of ['1e2', '0x10', '', ' 30', '+30', 'Infinity', 'NaN']) {
    assert.equal((await handle(get('/api/records/exercise-estimate?date=2026-11-14&code=test&minutes=' + encodeURIComponent(value)))).status, 400);
    assert.equal((await handle(get('/api/records/exercises?offset=' + encodeURIComponent(value)))).status, 400);
  }
  assert.equal(calls.length, 0);
  assert.equal((await handle(get('/api/records/exercise-estimate?date=2026-11-14&code=test&minutes=30.5'))).status, 200);assert.equal(calls[0].minutes, 30.5);
});

test('signed-save routes parse canonical delivery timestamps without changing the command body',async()=>{
 const calls=[];
 const service={current:async()=>({id:'fixture'})};
 for(const name of ['savePhoto','barcodeSave'])service[name]=async(_secret,body,_signal,delivery)=>{calls.push({body,delivery});return {ok:true};};
 const handle=createWebHandler({config,service});
 for(const path of ['/api/photos/save','/api/barcode/save']){
  for(const value of ['invalid','2026-03-02',null,'2026-03-02T00:00:00.000Z']){
   const req=request(path);
   if(value!==null)req.headers.set('X-Nourishing-Review-Saved-At',value);
   const valid=value===null||value.endsWith('Z');
   assert.equal((await handle(req)).status,valid?200:400);
   if(valid)assert.deepEqual(calls.at(-1),{body:{},delivery:{reviewSavedAt:value===null?undefined:Date.parse(value)}});
  }
 }
 assert.equal(calls.length,4);
});
