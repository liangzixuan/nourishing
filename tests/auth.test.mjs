import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHandler } from '../server/http.mjs';
import { readConfig } from '../server/config.mjs';
import { sessionCookie, readSession, clearSession } from '../server/session-cookie.mjs';

const config = readConfig({APPWRITE_ENDPOINT:'https://nyc.cloud.appwrite.io/v1', APPWRITE_PROJECT_ID:'project', PUBLIC_ORIGIN:'https://candidate.example'});
test('cloud configuration requires explicit HTTPS origins and rejects embedded credentials', () => {
  for (const PUBLIC_ORIGIN of ['http://candidate.example','https://x:y@candidate.example','https://candidate.example/path']) {
    assert.throws(() => readConfig({APPWRITE_ENDPOINT:config.endpoint,APPWRITE_PROJECT_ID:'project',PUBLIC_ORIGIN}));
  }
});
test('session cookies are private, expire with the provider session, and reject ambiguous cookies', () => {
  const cookie=sessionCookie({secret:'secret+/%value',expire:'2099-01-01T00:00:00Z'});
  assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
  assert.match(cookie,/Expires=Thu, 01 Jan 2099/);
  assert.equal(readSession(cookie),'secret+/%value');
  assert.throws(()=>readSession(`${cookie}; __Host-nourishing_session=other`));
  assert.match(clearSession(),/Max-Age=0/);
  assert.throws(()=>sessionCookie({secret:'',expire:'2099-01-01'}));
});

async function withServer(t, service) {
  const server=createServer(createHandler({config, service}));
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return async(path, {method='GET',body,cookie,origin=config.origin}={})=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{
    method, headers:{...(method!=='GET'?{'origin':origin,'content-type':'application/json'}:{}),...(cookie?{cookie}: {})},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})
  });
}
const denied=()=>{throw Object.assign(new Error('Provider detail PRIVATE'),{code:401});};
test('anonymous and revoked sessions cannot read a profile; responses disclose no provider secrets',async t=>{
  const request=await withServer(t,{current:denied});
  for(const cookie of [undefined,'__Host-nourishing_session=revoked']){
    const r=await request('/api/account',{cookie}); assert.equal(r.status,401);
    assert.match(r.headers.get('cache-control'),/no-store/); assert.doesNotMatch(await r.text(),/PRIVATE/);
  }
});
test('cross-origin mutations are rejected before reaching the provider',async t=>{
  let calls=0; const request=await withServer(t,{login:async()=>{calls++;}});
  const r=await request('/api/auth/login',{method:'POST',body:{},origin:'https://attacker.example'});
  assert.equal(r.status,403);assert.equal(calls,0);
});
test('sign-in returns only a secure cookie, not the session secret in JSON',async t=>{
  const request=await withServer(t,{login:async()=>({secret:'PRIVATE_SESSION',expire:'2099-01-01T00:00:00Z'})});
  const r=await request('/api/auth/login',{method:'POST',body:{email:'a@example.test',password:'correct horse battery staple'}});
  assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/PRIVATE_SESSION/);assert.doesNotMatch(await r.text(),/PRIVATE_SESSION/);
});
test('concurrent accounts use their own request session and reject supplied owner IDs',async t=>{
  const seen=[];const request=await withServer(t,{current:async secret=>{seen.push(secret);await new Promise(r=>setTimeout(r,5));return {id:secret};}});
  const results=await Promise.all(['alice','bob'].map(async id=>(await request('/api/account',{cookie:`__Host-nourishing_session=${id}`})).json()));
  assert.deepEqual(results,[{id:'alice'},{id:'bob'}]);assert.deepEqual(seen,['alice','bob']);
  const r=await request('/api/profile',{method:'PUT',cookie:'__Host-nourishing_session=alice',body:{ownerId:'bob',timeZone:'UTC',units:'metric'}});
  assert.equal(r.status,400);
});
test('recovery destination is fixed by configuration and ignores no caller URLs',async t=>{
  let calls=0;const request=await withServer(t,{requestRecovery:async()=>{calls++;}});
  const bad=await request('/api/auth/recovery',{method:'POST',body:{email:'a@example.test',url:'https://attacker.example'}});
  assert.equal(bad.status,400);assert.equal(calls,0);
  const good=await request('/api/auth/recovery',{method:'POST',body:{email:'a@example.test'}});
  assert.equal(good.status,200);assert.equal(calls,1);
});
test('sign-out clears a revoked session too',async t=>{
  const request=await withServer(t,{logout:denied});
  const r=await request('/api/auth/logout',{method:'POST',cookie:'__Host-nourishing_session=revoked',body:{}});
  assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);
});
test('password reset works without a session and passes only the emailed token fields',async t=>{
  let received;const request=await withServer(t,{resetPassword:async value=>{received=value;}});
  const r=await request('/api/auth/reset',{method:'POST',body:{userId:'user-a',secret:'TOKEN',password:'new password 1234'}});
  assert.equal(r.status,200);assert.deepEqual(received,{userId:'user-a',secret:'TOKEN',password:'new password 1234'});
  assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.doesNotMatch(await r.text(),/TOKEN/);
});
test('verification requires a session to send and never returns the verification token',async t=>{
  let sent=0,confirmed=0;const request=await withServer(t,{requestVerification:async()=>{sent++;return {secret:'PRIVATE_TOKEN'};},verifyEmail:async()=>{confirmed++;return {secret:'PRIVATE_TOKEN'};}});
  assert.equal((await request('/api/auth/verification',{method:'POST',body:{}})).status,401);assert.equal(sent,0);
  const r=await request('/api/auth/verification',{method:'POST',cookie:'__Host-nourishing_session=user-a',body:{}});
  assert.equal(r.status,200);assert.equal(sent,1);assert.doesNotMatch(await r.text(),/PRIVATE_TOKEN/);
  const v=await request('/api/auth/verify',{method:'POST',body:{userId:'user-a',secret:'TOKEN'}});
  assert.equal(v.status,200);assert.equal(confirmed,1);assert.doesNotMatch(await v.text(),/PRIVATE_TOKEN/);
});
