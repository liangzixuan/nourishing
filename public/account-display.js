import {writeDeviceCache} from './device-cache.js';

export const accountDisplayKey='/api/account?view=display';
export function accountDisplay(value){
 return {id:value.id,name:value.name,email:value.email,emailVerified:value.emailVerified,profile:{timeZone:value.profile?.timeZone,units:value.profile?.units}};
}
export async function cacheAccountDisplay(account,ticket){
 if(ticket?.ownerId!==account.id)return false;
 return writeDeviceCache(accountDisplayKey,accountDisplay(account),ticket).catch(()=>false);
}
