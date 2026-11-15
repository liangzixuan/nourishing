import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebHandler} from '../server/http.mjs';
import {CSV_BODY_BYTES} from '../server/csv-import.mjs';

const origin='https://nourishing.example',paths=['/api/imports/csv/preview','/api/imports/csv/import'];
const post=(path,body,headers={})=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'__Host-nourishing_session=fixture',...headers},body,...(body instanceof ReadableStream?{duplex:'half'}:{})});
function fixture(){
 const calls=[],service={current:async secret=>{calls.push(['auth',secret]);if(secret!=='fixture')throw Object.assign(Error('Sign in'),{code:401});},previewCsvImport:async(secret,input)=>{calls.push(['preview',secret,input]);return {count:1};},importCsv:async(secret,input)=>{calls.push(['import',secret,input]);return {ok:true,count:1};}};
 return {calls,handle:createWebHandler({config:{origin},service})};
}
test('CSV routes authenticate before parsing and reject origin, query and media type changes',async()=>{
 for(const path of paths){
  const {handle,calls}=fixture();
  assert.equal((await handle(post(path,'invalid',{Cookie:''}))).status,401);assert.deepEqual(calls,[]);
  assert.equal((await handle(post(path,'invalid',{Cookie:'__Host-nourishing_session=wrong'}))).status,401);assert.deepEqual(calls,[['auth','wrong']]);
  assert.equal((await handle(post(path+'?ownerId=someone','invalid'))).status,400);
  assert.equal((await handle(post(path,'{}',{Origin:'https://other.example'}))).status,403);
  assert.equal((await handle(post(path,'{}',{'Content-Type':'text/plain'}))).status,415);
  assert.equal(calls.some(call=>call[0]!=='auth'),false);
 }
});
test('CSV routes accept file-sized JSON and enforce their dedicated bound',async()=>{
 for(const [index,path]of paths.entries()){
  const {handle,calls}=fixture(),input={kind:'foods',text:'name\n'+('Synthetic food\n'.repeat(3000))};
  const response=await handle(post(path,JSON.stringify(input)));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(calls.at(-1),[index?'import':'preview','fixture',input]);
  const oversized=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(CSV_BODY_BYTES+1));controller.close();}});
  assert.equal((await handle(post(path,oversized))).status,413);assert.equal(calls.filter(call=>call[0]!=='auth').length,1);
 }
});
