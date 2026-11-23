import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createCloudPhotoAnalyzer, signPhotoReview, verifyPhotoReview} from '../server/cloud-photo.mjs';

const secret = 'fixture-secret-at-least-thirty-two-characters', owner = 'fixture-owner', photoId = 'a'.repeat(64), now = 1700000000000;
const estimate = {grams: 120, lowerGrams: 80, upperGrams: 180, reason: 'Depth is unclear.'};
const analysis = {observations: [{description: 'White rice', preparation: 'cooked', uncertainty: 'Variety is unclear.', portionEstimate: estimate}], possibleAdditions: [], notes: ''};
const raw = {foods: [{name: 'White rice', preparation: 'cooked', uncertainty: 'Variety is unclear.', portionEstimate: estimate}], possibleAdditions: [], notes: ''};
const imageData = 'data:image/png;base64,' + (await sharp({create: {width: 24, height: 20, channels: 3, background: '#aaaaaa'}}).png().toBuffer()).toString('base64');

const matching = (search = async () => ({items: []})) => async () => ({search, foods: []});

test('photo review is authenticated, owner-bound, photo-bound and expiring', () => {
  const token = signPhotoReview({owner, photoId, analysis}, {secret, now});
  assert.deepEqual(verifyPhotoReview(token, {owner, photoId, secret, now: now + 1000}), analysis);
  for (const options of [{owner: 'other'}, {photoId: 'b'.repeat(64)}, {secret: secret + 'other'}, {now: now + 30 * 60 * 1000}]) assert.throws(() => verifyPhotoReview(token, {owner, photoId, secret, now, ...options}), {code: 409});
  const [payload, signature] = token.split('.'), parsed = JSON.parse(Buffer.from(payload, 'base64url'));parsed.analysis.observations[0].portionEstimate.grams = 170;
  assert.throws(() => verifyPhotoReview(Buffer.from(JSON.stringify(parsed)).toString('base64url') + '.' + signature, {owner, photoId, secret, now}), {code: 409});
  assert.throws(() => signPhotoReview({owner, photoId, analysis: null}, {secret, now}), {code: 502});
});

test('recognition normalizes images, disables storage, bounds overload retries, and ranks original source matches', async () => {
  let captured, requests = 0;
  const analyzer = createCloudPhotoAnalyzer({apiKey: 'fixture-key', reviewSecret: secret, now: () => now, clientFactory: async () => ({interactions: {create: async (input, options) => {captured = {input, options}; return {status: 'completed', output_text: JSON.stringify(raw), usage: {total_input_tokens: 5, total_output_tokens: 20}};}}})});
  const result = await analyzer.analyze({image: imageData}, {owner, prepareMatching: matching(async () => {requests++;return {items: [{id: 'raw', name: 'White rice, raw', grams: 100, serving: '100 g'}, {id: 'cooked', name: 'White rice, cooked', grams: 100, serving: '100 g'}]};})});
  assert.equal(captured.input.store, false);assert.equal(captured.options.retries.strategy, 'attempt-count-backoff');assert.equal(captured.options.retries.maxRetries,2);assert.equal(captured.options.retries.retryConnectionErrors,false);assert.deepEqual(captured.options.retry_codes,['503']);assert.equal(captured.input.generation_config.thinking_level, 'minimal');
  assert.equal(captured.input.input[0].content[1].mime_type, 'image/jpeg');assert.match(result.photo.dataUrl, /^data:image\/jpeg;base64,/);assert.equal(result.photo.width, 24);
  assert.equal(result.suggestions[0].selection.id, 'cooked');assert.deepEqual(result.observations[0].portionEstimate, estimate);assert.ok(requests > 0 && requests <= 4);
  assert.deepEqual(verifyPhotoReview(result.reviewToken, {owner, photoId: result.photo.id, secret, now}), analysis);
  assert.equal(result.metrics.inputTokens, 5);assert.ok(!JSON.stringify(result).includes('fixture-key'));
});

test('catalog setup overlaps inference and a failed setup cancels the provider request', {timeout: 4000}, async () => {
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  let providerSignal;
  const analyzer = createCloudPhotoAnalyzer({apiKey: 'fixture', reviewSecret: secret, clientFactory: async () => ({
    interactions: {async create(input, {signal}) {
      providerSignal = signal;
      entered.resolve();
      await release.promise;
      return {status: 'completed', output_text: JSON.stringify(raw)};
    }},
  })});
  const failure = Error('workspace unavailable');
  const work = analyzer.analyze({image: imageData}, {owner, async prepareMatching() {
    await entered.promise;
    throw failure;
  }});
  try {
    await assert.rejects(work, error => error === failure);
    assert.equal(providerSignal.aborted, true);
  } finally { release.resolve(); }
});

test('invalid images and model nutrition inventions do not become review data', async () => {
  let called = false;
  const clientFactory = async () => ({interactions: {create: async () => {called = true;return {status: 'completed', output_text: JSON.stringify({...raw, calories: 200})};}}});
  const analyzer = createCloudPhotoAnalyzer({apiKey: 'fixture-key', reviewSecret: secret, clientFactory});
  await assert.rejects(() => analyzer.analyze({image: 'data:image/png;base64,YQ=='}, {owner, prepareMatching: matching()}), {code: 400});assert.equal(called, false);
  await assert.rejects(() => analyzer.analyze({image: imageData}, {owner, prepareMatching: matching()}), {code: 502});
});

test('quota and cancellation errors are concise and do not disclose provider details', async () => {
  const analyzer = createCloudPhotoAnalyzer({apiKey: 'fixture-key', reviewSecret: secret, clientFactory: async () => ({interactions: {create: async () => {throw {statusCode: 429, message: 'provider-secret-detail'};}}})});
  await assert.rejects(() => analyzer.analyze({image: imageData}, {owner, prepareMatching: matching()}), error => error.code === 429 && !error.message.includes('provider-secret-detail'));
  const abort = new AbortController();abort.abort();await assert.rejects(() => analyzer.analyze({image: imageData}, {owner, prepareMatching: matching(), signal: abort.signal}), {code: 499});
});


test('installed Gemini SDK retries only explicit overload and obeys cancellation and deadline', async () => {
  const {GoogleGenAI}=await import('@google/genai'),{createServer}=await import('node:http');
  let responses=[],calls=[],afterRequest;
  const server=createServer(async(req,res)=>{let rawBody='';for await(const chunk of req)rawBody+=chunk;calls.push(JSON.parse(rawBody));const code=responses.shift()??503;res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(code===200?{id:'fixture-interaction',status:'completed',output_text:JSON.stringify(raw),usage:{total_input_tokens:5,total_output_tokens:20}}:{error:{code:code===429?'resource_exhausted':'service_unavailable',message:'provider-private-detail'}}));afterRequest?.();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port,client=new GoogleGenAI({apiKey:'fixture-key',vertexai:false,apiVersion:'v1'}),factory=async()=>({interactions:{create:(input,options)=>client.interactions.create(input,{...options,server_url:origin})}}),analyzer=createCloudPhotoAnalyzer({apiKey:'fixture-key',reviewSecret:secret,clientFactory:factory}),context={owner,prepareMatching:matching()};
  try{
    responses=[503,200];const result=await analyzer.analyze({image:imageData},context);assert.equal(result.observations.length,1);assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].store,false);
    calls=[];responses=[503,503,503,200];await assert.rejects(()=>analyzer.analyze({image:imageData},context),error=>error.code===503&&!error.message.includes('provider-private-detail'));assert.equal(calls.length,3);
    for(const status of [400,401,403,429]){calls=[];responses=[status,200];await assert.rejects(()=>analyzer.analyze({image:imageData},context),{code:status===429?429:503});assert.equal(calls.length,1);}
    calls=[];responses=[503,200];const abort=new AbortController();afterRequest=()=>abort.abort();await assert.rejects(()=>analyzer.analyze({image:imageData},{...context,signal:abort.signal}),{code:499});assert.equal(calls.length,1);afterRequest=undefined;
    calls=[];responses=[503,200];const short=createCloudPhotoAnalyzer({apiKey:'fixture-key',reviewSecret:secret,clientFactory:factory,timeoutMs:100});await assert.rejects(()=>short.analyze({image:imageData},context),{code:504});assert.equal(calls.length,1);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
