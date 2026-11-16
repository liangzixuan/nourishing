import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBrowserLanguage,applyAppLanguage,uiLanguage,t} from '../public/app-language.js';
import {coreCloudMessages,coreText} from '../public/core-cloud-messages.js';
import {requestErrorMessage} from '../public/request-error.js';
import {initialState,act} from '../server/domain/workspace.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {displayView} from '../server/display-settings.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {createWebHandler} from '../server/http.mjs';

test('supported browser preferences resolve before a saved account language takes ownership',()=>{
 for(const [input,expected] of [[['fr-CA','en'],'fr'],[['de-DE'],'de'],[['pt'],'pt-BR'],[['pt-BR'],'pt-BR'],[['es','de-AT'],'de'],[['es','it'],'en'],[['en-GB','fr'],'en']])assert.equal(resolveBrowserLanguage(input),expected);
 applyAppLanguage('fr');assert.equal(uiLanguage(),'fr');assert.equal(t('mobileDisplay.appLanguage'),'Langue');
 assert.throws(()=>applyAppLanguage('es'));assert.equal(uiLanguage(),'fr');assert.equal(applyAppLanguage(), 'en');
 for(const locale of ['en','fr','de','pt-BR']){
  assert.deepEqual(Object.keys(coreCloudMessages[locale]),Object.keys(coreCloudMessages.en));
  for(const [key,value]of Object.entries(coreCloudMessages[locale])){assert.equal(typeof value,'string');const fields=text=>[...text.matchAll(/\{\{(\w+)\}\}/g)].map(row=>row[1]).sort();assert.deepEqual(fields(value),fields(coreCloudMessages.en[key]),locale+':'+key);}
  assert.ok(coreText('tools.selectName',{name:'原文 <saved>'},locale).includes('原文 <saved>'));
  assert.ok(!t('mobileDisplay.customFont',{scale:1.2},locale).includes('{scale}'));
 }
});

test('language preference persists once after a lost reply and cannot alter records or other account settings',async()=>{
 const seed=initialState(),food=act(seed,'food.save',{name:'Original Food',grams:100,nutrients:{protein:0,calories:120}});act(seed,'entry.add',{date:'2026-11-16',foodId:food.id,amount:1,group:'Lunch'});
 const fixture=diaryStoreFixture(seed),other=diaryStoreFixture(initialState(),'other'),store=createWorkspaceStore(fixture.db,'fixture'),repository=createDataRepository(fixture.db,'fixture');
 for(const locale of ['fr','de','pt-BR','en']){
  const before=fixture.state(),input={requestId:crypto.randomUUID(),revision:displayView(before).revision,type:'display.save',payload:{appLanguage:locale}};
  const result=await store.command(input);assert.deepEqual(await store.command(input),result);const after=fixture.state();assert.equal(displayView(after).settings.appLanguage,locale);
  const expected=structuredClone(before);expected.settings.appLanguage=locale;assert.deepEqual(after,expected);
  const diary=await repository.diary('2026-11-16',{now:new Date('2026-11-16T12:00:00Z'),timeZone:'UTC'});assert.equal(diary.presentation.settings.appLanguage,locale);assert.equal(diary.entries[0].facts.name,'Original Food');assert.equal(diary.summary.totals.protein,0);
 }
 assert.equal(other.state().settings.appLanguage,undefined);
 const before=fixture.state();for(const value of ['es','en-GB','fr-CA','',null,1])await assert.rejects(store.command({requestId:crypto.randomUUID(),revision:displayView(before).revision,type:'display.save',payload:{appLanguage:value}}),error=>(error.status??error.code)===400);
 assert.deepEqual(fixture.state(),before);
 const stale={requestId:crypto.randomUUID(),revision:displayView(before).revision,type:'display.save',payload:{appLanguage:'fr'}};await store.command({...stale,requestId:crypto.randomUUID(),payload:{theme:'light'}});await assert.rejects(store.command(stale),error=>(error.status??error.code)===409);assert.equal(fixture.state().settings.appLanguage,'en');
});

test('HTTP error tags localize login failures without interpreting provider prose',async()=>{
 const origin='https://fixture.example',handler=createWebHandler({config:{origin},service:{login:async()=>{throw {code:401,publicMessage:'Unstable provider prose'};}}});
 const response=await handler(new Request(origin+'/api/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:'fixture@example.com',password:'test-password'})}));
 assert.equal(response.status,401);const body=await response.json();assert.equal(body.errorCode,'auth.invalidCredentials');
 assert.equal(requestErrorMessage(body,401,'fr'),coreText('auth.invalidCredentials',{},'fr'));
 assert.equal(requestErrorMessage({error:'Changed provider prose'},503,'de'),coreText('request.unavailable',{},'de'));
 assert.equal(requestErrorMessage({error:'Exact English evidence'},400,'en'),'Exact English evidence');
});
