import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebHandler} from '../server/http.mjs';

const config = {origin: 'https://candidate.example'}, cookie = '__Host-nourishing_session=fixture-session';
const paths = ['/api/photos/analyze', '/api/photos/save'];
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
  assert.equal(accounts, 2);assert.equal(operations, 0);
});

test('photo routes bound authorized bodies, reject query overrides, and keep results private', async () => {
  const calls = [], service = {current: async secret => {assert.equal(secret, 'fixture-session');return {$id: 'fixture'};}};
  for (const method of ['analyzePhoto', 'savePhoto']) service[method] = async (secret, body, signal) => {calls.push({method, secret, body, signal});return {ok: true};};
  const handle = createWebHandler({config, service});
  for (const path of paths) {
    assert.equal((await handle(request(path + '?owner=other'))).status, 400);
    assert.equal((await handle(request(path, {body: 'invalid'}))).status, 400);
    const limit = path.endsWith('/analyze') ? 12 : 5, large = request(path);
    const guarded = {url: large.url, method: large.method, headers: large.headers, signal: large.signal, body: (async function* () {yield Buffer.alloc(limit * 1024 * 1024 + 1);})()};
    assert.equal((await handle(guarded)).status, 413);
    const response = await handle(request(path, {body: JSON.stringify({image: 'fixture'})}));
    assert.equal(response.status, 200);assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(calls.length, 2);assert.deepEqual(calls.map(call => call.method), ['analyzePhoto', 'savePhoto']);
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
