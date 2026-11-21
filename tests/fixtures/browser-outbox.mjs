import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
/** Observe real receipt effects and persisted writes without a second worker. */
export async function waitForOutboxIdle(page,committed=()=>true){
 const until=Date.now()+10000;
 do{
  const idle=await page.evaluate(async()=>{
   const {readWriteCopy}=await import('/offline-store.js'),copy=await readWriteCopy();
   return Boolean(copy?.snapshot&&!copy.locked&&copy.pending.length===0&&!document.querySelector('[data-display-root][aria-busy=true]'));
  });
  if(committed()&&idle)return;
  await delay(20);
 }while(Date.now()<until);
 assert.fail('The application worker did not commit and acknowledge the expected changes.');
}
