import {formatMessage} from './report-source/public/message-format.js';
import {createMessageFormatter} from './report-source/public/message-formatter.js';
import {appLanguages,parseAppLanguage} from './health-source/server/app-language.mjs';

export {appLanguages};
export const supportedLanguages=Object.freeze(appLanguages.map(({id})=>id));
export function resolveBrowserLanguage(languages=globalThis.navigator?.languages??[]){
 for(const candidate of languages){const tag=String(candidate).toLowerCase();if(tag==='pt-br'||tag==='pt')return 'pt-BR';for(const language of ['en','fr','de'])if(tag===language||tag.startsWith(language+'-'))return language;}
 return 'en';
}
let language=resolveBrowserLanguage();
export const uiLanguage=()=>language;
export function applyAppLanguage(value){
 language=parseAppLanguage(value);if(globalThis.document)document.documentElement.lang=language;
 return language;
}
// Explicit keys only: caller-owned names, user text and source values stay unchanged.
export const t=(key,values={},locale=language)=>formatMessage(locale,key,values);
export function createUITranslator(messages){const format=createMessageFormatter(messages);return (key,values={},locale=language)=>format(locale,key,values);}
