import {AsyncLocalStorage} from 'node:async_hooks';
import {Client} from 'node-appwrite';
const operations=new AsyncLocalStorage();
export const withinAccountOperation=(operation,work)=>operations.run(operation,work);
export async function trackRemoteCall(method,work){
 try{return await work();}catch(error){
  const code=Number(error.code),definitive=Number.isInteger(code)&&code>=400&&code<500&&code!==408;
  if(!['get','head','options'].includes(method.toLowerCase())&&!definitive)operations.getStore()?.markUncertain();
  throw error;
 }
}
/** Track unresolved provider mutations without retaining requests, credentials or health data. */
export class AccountOperationClient extends Client{
 call(method,...args){return trackRemoteCall(method,()=>super.call(method,...args));}
}
