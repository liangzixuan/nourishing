export const appLanguages=Object.freeze([
 {id:'en',name:'English',measureLocale:'en_US'},
 {id:'fr',name:'Français',measureLocale:'fr'},
 {id:'de',name:'Deutsch',measureLocale:'de'},
 {id:'pt-BR',name:'Português (Brasil)',measureLocale:'pt_BR'},
].map(Object.freeze));
export function parseAppLanguage(value='en'){
 if(!appLanguages.some(language=>language.id===value))throw Object.assign(Error('Choose a supported application language.'),{status:400});
 return value;
}
export function appMeasureLocale(value){return appLanguages.find(language=>language.id===parseAppLanguage(value)).measureLocale;}
