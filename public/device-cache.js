import {activateOfflineAccount,resumePrivateResponses,resumeOfflinePrivateResponses,bindPrivateResponseSession,readPrivateResponse,writePrivateResponse,invalidatePrivateResponses,invalidatePrivateResponsePaths,currentPrivateResponseTicket} from './offline-store.js';

const state=(globalThis[Symbol.for('nourishing.deviceCache')]??={verified:null,initialization:0});
const miss=()=>({value:undefined,savedAt:null,ticket:null});
const same=(a,b)=>!!a&&!!b&&a.ownerId===b.ownerId&&a.epoch===b.epoch;
function allowed(path){
 // This exact key contains only the Account renderer's display projection.
 // The authentication endpoint and all credential/recovery reads stay blocked.
 if(path==='/api/account?view=display')return true;
 return typeof path==='string'&&path.startsWith('/api/')&&!path.startsWith('//')&&!/[\\#]/.test(path)&&!/^\/api\/(?:auth|account|backup|recovery|offline)(?:[/?]|$)/.test(path)&&!/(?:^|\/)(?:share|export|review)(?:[/?]|$)/.test(path);
}
export async function initializeDeviceCache(ownerId,options){
 const current=++state.initialization;state.verified=null;if(!globalThis.indexedDB)return null;
 const ticket=await activateOfflineAccount(ownerId,options);if(current!==state.initialization)return null;
 state.verified={ownerId:ticket.ownerId,epoch:ticket.epoch,cacheRevision:ticket.cacheRevision};return {...state.verified};
}
export async function readDeviceCache(path){
 if(!state.verified||!allowed(path))return miss();const expected=state.verified,current=state.initialization,result=await readPrivateResponse(path,expected);
 if(current!==state.initialization||!same(state.verified,expected))return miss();return result;
}
export async function writeDeviceCache(path,value,ticket){
 if(!state.verified||!same(state.verified,ticket)||!allowed(path))return false;let size;
 if(typeof Blob==='function'&&value instanceof Blob){if(!/^\/api\/media(?:\?|$)/.test(path)||value.size>8*1024*1024)return false;size=value.size;}
 else{if(/^\/api\/media(?:\?|$)/.test(path))return false;try{const json=JSON.stringify(value);if(json===undefined)return false;size=new TextEncoder().encode(json).byteLength;value=structuredClone(value);}catch{return false;}if(size>2*1024*1024)return false;}
 return writePrivateResponse(path,value,size,ticket);
}
export async function invalidateDeviceCache(ticket=state.verified){
 if(!state.verified||!same(state.verified,ticket))return null;const current=state.initialization,result=await invalidatePrivateResponses(ticket);
 if(current!==state.initialization||!same(state.verified,ticket))return null;if(result)state.verified=result;return result;
}
export async function invalidateDeviceCachePaths(shouldDrop,ticket=state.verified,options){
 if(!state.verified||!same(state.verified,ticket))return null;const current=state.initialization,result=await invalidatePrivateResponsePaths(ticket,shouldDrop,options);
 if(current!==state.initialization||!same(state.verified,ticket))return null;if(result)state.verified=result;return result;
}
export async function hasCurrentDeviceCache(ticket){
 if(!state.verified||!same(state.verified,ticket))return false;const current=state.initialization,active=await currentPrivateResponseTicket(ticket);
 return current===state.initialization&&same(state.verified,ticket)&&!!active&&active.cacheRevision===ticket.cacheRevision;
}

export async function resumeDeviceCache(context){
 const current=++state.initialization;state.verified=null;if(!globalThis.indexedDB)return null;
 const ticket=await resumePrivateResponses(context);if(current!==state.initialization||!ticket)return null;
 state.verified=ticket;return {...ticket};
}

/** Public offline shells may reopen only the last unlocked, verified account. */
export async function resumeOfflineDeviceCache(){
 const current=++state.initialization;state.verified=null;if(!globalThis.indexedDB)return null;
 const ticket=await resumeOfflinePrivateResponses();if(current!==state.initialization||!ticket)return null;
 state.verified=ticket;return {...ticket};
}

export async function bindDeviceCacheSession(context,ticket){
 if(!state.verified||!same(state.verified,ticket))return null;
 const current=state.initialization,bound=await bindPrivateResponseSession(ticket,context);
 if(current!==state.initialization||!same(state.verified,ticket)||!bound)return null;
 state.verified=bound;return {...bound};
}
