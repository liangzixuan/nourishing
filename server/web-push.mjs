// Web Push boundary and transport adapted from cronometer-local/server/reminders.mjs.
// SQLite, native Android transports and local-origin restrictions are not part of this module.
import {createECDH,ECDH} from 'node:crypto';
import webPush from 'web-push';

export const PUSH_DEVICE_LIMIT=8;
export const pushFail=(message,code=400)=>{throw Object.assign(Error(message),{code,status:code,publicMessage:message});};
export function pushFields(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))pushFail('Check the notification request.');return value;}
function bytes(value,length,label){
 if(typeof value!=='string'||value.length!==Math.ceil(length*8/6)||!/^[\w-]+$/.test(value))pushFail(`Invalid ${label}.`);
 const result=Buffer.from(value,'base64url');if(result.length!==length||result.toString('base64url')!==value)pushFail(`Invalid ${label}.`);return result;
}
export function parsePushSubscription(input){
 pushFields(input,['endpoint','expirationTime','keys']);
 if(typeof input.endpoint!=='string'||input.endpoint.length>4096||/[\u0000-\u0020\u007f]/.test(input.endpoint))pushFail('The browser returned an invalid push endpoint.');
 let url;try{url=new URL(input.endpoint);}catch{pushFail('The browser returned an invalid push endpoint.');}
 const supported=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(url.hostname)||/^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname);
 if(!supported||url.protocol!=='https:'||url.port||url.username||url.password||url.hash)pushFail('This browser push provider is not supported.');
 const keys=pushFields(input.keys,['p256dh','auth']),point=bytes(keys.p256dh,65,'browser encryption key');bytes(keys.auth,16,'browser authentication key');
 try{ECDH.convertKey(point,'prime256v1');}catch{pushFail('The browser encryption key is invalid.');}
 if(input.expirationTime!==null&&input.expirationTime!==undefined&&(!Number.isFinite(input.expirationTime)||input.expirationTime<0))pushFail('The push expiration time is invalid.');
 return {endpoint:input.endpoint,expirationTime:input.expirationTime??null,keys:{p256dh:keys.p256dh,auth:keys.auth}};
}
export function parseVapid(vapid,origin){
 let url;try{url=new URL(origin);}catch{pushFail('Notifications are unavailable.',503);}
 if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password)pushFail('Notifications are unavailable.',503);
 try{
  const privateBytes=bytes(vapid?.privateKey,32,'notification signing key'),publicBytes=bytes(vapid?.publicKey,65,'notification public key'),ecdh=createECDH('prime256v1');
  ecdh.setPrivateKey(privateBytes);if(!ecdh.getPublicKey().equals(publicBytes))throw Error();
 }catch{pushFail('Notifications are unavailable.',503);}
 return {subject:origin,publicKey:vapid.publicKey,privateKey:vapid.privateKey};
}
export function createWebPushTransport({fetchImpl=fetch,library=webPush}={}){
 return async(subscription,payload,options)=>{
  const {signal,...protocolOptions}=options,details=library.generateRequestDetails(subscription,payload,protocolOptions);
  const response=await fetchImpl(details.endpoint,{method:details.method,headers:details.headers,body:details.body,redirect:'error',signal});
  const statusCode=response.status;await response.body?.cancel();return {statusCode};
 };
}
