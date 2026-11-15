import {createInstance} from './vendor/i18next/26.7.1/i18next.js';
export function createMessageFormatter(uiMessages){
const i18n=createInstance();
// Each call supplies its language. Captured documents must not depend on a
// later UI preference. Interpolation returns plain text for the output owner
// to escape or assign through textContent.
i18n.init({initAsync:false,lng:'en',fallbackLng:'en',supportedLngs:Object.keys(uiMessages),resources:Object.fromEntries(Object.entries(uiMessages).map(([language,translation])=>[language,{translation}])),keySeparator:false,nsSeparator:false,returnNull:false,returnEmptyString:false,interpolation:{escapeValue:false}});
return function formatMessage(language,key,values={}){return i18n.t(key,{...values,lng:language});}

}
