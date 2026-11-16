import {activateOfflineAccount,resumePrivateResponses,readPrivateResponse,writePrivateResponse,invalidatePrivateResponses,currentPrivateResponseTicket} from './offline-store.js';

let verified=null,initialization=0;
const miss=()=>({value:undefined,savedAt:null,ticket:null});
const same=(a,b)=>!!a&&!!b&&a.ownerId===b.ownerId&&a.epoch===b.epoch;
function allowed(path){
 // This exact key contains only the Account renderer's display projection.
 // The authentication endpoint and all credential/recovery reads stay blocked.
 if(path==='/api/account?view=display')return true;
 return typeof path==='string'&&path.startsWith('/api/')&&!path.startsWith('//')&&!/[\\#]/.test(path)&&!/^\/api\/(?:auth|account|backup|recovery|offline)(?:[/?]|$)/.test(path)&&!/(?:^|\/)(?:share|export|review)(?:[/?]|$)/.test(path);
}
export async function initializeDeviceCache(ownerId,options){
 const current=++initialization;verified=null;if(!globalThis.indexedDB)return null;
 const ticket=await activateOfflineAccount(ownerId,options);if(current!==initialization)return null;
 verified={ownerId:ticket.ownerId,epoch:ticket.epoch,cacheRevision:ticket.cacheRevision};return {...verified};
}
export async function readDeviceCache(path){
 if(!verified||!allowed(path))return miss();const expected=verified,current=initialization,result=await readPrivateResponse(path,expected);
 if(current!==initialization||!same(verified,expected))return miss();return result;
}
export async function writeDeviceCache(path,value,ticket){
 if(!verified||!same(verified,ticket)||!allowed(path))return false;let size;
 if(typeof Blob==='function'&&value instanceof Blob){if(!/^\/api\/media(?:\?|$)/.test(path)||value.size>8*1024*1024)return false;size=value.size;}
 else{if(/^\/api\/media(?:\?|$)/.test(path))return false;try{const json=JSON.stringify(value);if(json===undefined)return false;size=new TextEncoder().encode(json).byteLength;value=structuredClone(value);}catch{return false;}if(size>2*1024*1024)return false;}
 return writePrivateResponse(path,value,size,ticket);
}
export async function invalidateDeviceCache(ticket=verified){
 if(!verified||!same(verified,ticket))return null;const current=initialization,result=await invalidatePrivateResponses(ticket);
 if(current!==initialization||!same(verified,ticket))return null;if(result)verified=result;return result;
}
export async function hasCurrentDeviceCache(ticket){
 if(!verified||!same(verified,ticket))return false;const current=initialization,active=await currentPrivateResponseTicket(ticket);
 return current===initialization&&same(verified,ticket)&&!!active&&active.cacheRevision===ticket.cacheRevision;
}

export async function resumeDeviceCache(context){
 const current=++initialization;verified=null;if(!globalThis.indexedDB)return null;
 const ticket=await resumePrivateResponses(context);if(current!==initialization||!ticket)return null;
 verified=ticket;return {...ticket};
}
