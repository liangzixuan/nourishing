import test from 'node:test';
import assert from 'node:assert/strict';
import {widgetDestination,widgetQuery} from '../public/widget-link.js';
import {createWebHandler} from '../server/http.mjs';
import {readFileSync} from 'node:fs';

test('widget routes are a closed set and never accept arbitrary destinations',()=>{
 for(const destination of ['diary','food','fasting']){assert.equal(widgetDestination(widgetQuery(destination)),destination);assert.equal(widgetQuery(destination),'?widget='+destination);}
 for(const query of ['','?widget=','?widget=food&widget=fasting','?widget=https://other.example','?widget=//other.example','?widget=FOOD'])assert.equal(widgetDestination(query),null);
 assert.equal(widgetQuery('https://other.example'),'');
});
test('root widget URLs serve the same client entry as the static deployment',async()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const origin='https://nourishing.example',handler=createWebHandler({config:{origin},service:{},assets:new Map([['/',{type:'text/html',body:html}]])});
 for(const destination of ['diary','food','fasting']){
  const response=await handler(new Request(origin+'/?widget='+destination+'&ownerId=other&returnTo=https://other.example'));
  assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);assert.equal(await response.text(),html);
 }
 const response=await handler(new Request(origin+'/?widget=https://other.example'));assert.equal(response.status,200);assert.equal(await response.text(),html);
});
