import {flushBackgroundWrites} from './background-writes.js';
import {offlineFailure} from './offline-errors.js';
import {offlineCopy} from './offline-store.js';
export async function prepareOfflineShell(){
 if(!navigator.serviceWorker)throw offlineFailure('unsupported');
 let timer,port;try{await Promise.race([(async()=>{
  await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
  const registration=await navigator.serviceWorker.ready,worker=registration.active;if(!worker)throw offlineFailure('reloadShell');
  await new Promise((resolve,reject)=>{const channel=new MessageChannel();port=channel.port1;port.onmessage=event=>event.data?.ok?resolve():reject(offlineFailure('setupFailed'));worker.postMessage({type:'PREPARE_OFFLINE'},[channel.port2]);});
 })(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(offlineFailure('setupTimedOut')),20000);})]);}finally{clearTimeout(timer);port?.close();}
}

export async function syncOfflineDiary(){await flushBackgroundWrites();return offlineCopy();}
