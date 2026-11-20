import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
/** Observe real receipt effects and persisted writes without a second worker. */
export async function waitForOutboxIdle(page,committed=()=>true){
 const until=Date.now()+10000;
 while(!committed()&&Date.now()<until)await delay(20);
 assert.ok(committed(),'Expected settings were not committed by the application worker.');
 await page.waitForFunction(async()=>{
  const {readWriteCopy}=await import('/offline-store.js');
  const copy=await readWriteCopy();
  return Boolean(copy?.snapshot&&!copy.locked&&copy.pending.length===0&&!document.querySelector('[data-display-root][aria-busy=true]'));
 });
}
