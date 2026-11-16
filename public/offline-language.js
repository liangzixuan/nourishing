import {accountMessage} from './account-cloud-messages.js';
import {resolveBrowserLanguage} from './app-language.js';
export const offlineLanguages=[['en','English'],['fr','Français'],['de','Deutsch'],['pt-BR','Português (Brasil)']];
export function offlineLanguage(value){return offlineLanguages.some(([code])=>code===value)?value:resolveBrowserLanguage();}
// Keys are chosen by each UI owner. User names, notes and saved source labels are never translated.
export const offlineMessage=(language,key,values={})=>accountMessage(key,values,language);
