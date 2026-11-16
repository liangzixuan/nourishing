import {uiLanguage,t} from './app-language.js';
import {fc} from './food-cloud-messages.js';
// Only submitted attempts persist. Owner identity is supplied by the authenticated shell.
export class FoodMultiRecovery{
 constructor(ownerId){if(typeof ownerId!=='string'||!ownerId)throw Error(fc("signInMultiAdd"));this.ownerId=ownerId;}
 async transaction(mode,action){
  const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('nourishing-food-multi',1);req.onupgradeneeded=()=>req.result.createObjectStore('pending',{keyPath:['ownerId','id']});req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result);});
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction('pending',mode),store=tx.objectStore('pending');let result,error;const fail=value=>{error=value;tx.abort();};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(error??tx.error??Error(fc("saveAttemptFailed")));tx.onerror=()=>{};try{action(store,value=>result=value,fail);}catch(value){fail(value);}});}finally{db.close();}
 }
 list(){return this.transaction('readonly',(store,set)=>{const req=store.getAll(IDBKeyRange.bound([this.ownerId,''],[this.ownerId,'\uffff']));req.onsuccess=()=>set(req.result);});}
 put(packet){
  if(packet.ownerId!==this.ownerId||packet.body!==JSON.stringify(packet.payload)||!packet.payload?.requestId||packet.payload.type!=='food.multi.add')throw Error(t("multiAdd.invalidRecovery"));
  const record={ownerId:this.ownerId,id:packet.payload.requestId,packet:structuredClone(packet)};
  return this.transaction('readwrite',(store,set,fail)=>{const req=store.get([this.ownerId,record.id]);req.onsuccess=()=>{if(req.result){if(req.result.packet.body!==packet.body)fail(Error(fc("attemptOwned")));}else store.add(record);};});
 }
 remove(id){return this.transaction('readwrite',store=>store.delete([this.ownerId,id]));}
}
