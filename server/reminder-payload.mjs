import {appLanguages} from './domain/app-language.mjs';

// Notification text stays fixed in the service worker; no diary text crosses this boundary.
export function reminderPayload(tag,language){
 return JSON.stringify({version:1,tag,language:appLanguages.some(row=>row.id===language)?language:'en'});
}
