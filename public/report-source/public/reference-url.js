/** Check the protocol without rewriting the captured source URL. */
export function isHttpsReferenceUrl(value){
 if(typeof value!=='string')return false;
 try{return new URL(value).protocol==='https:';}catch{return false;}
}
