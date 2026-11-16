import {formatMessage} from './../../report-source/public/message-format.js';
import {parseAppLanguage} from './../server/app-language.mjs';
let language='en';
export function uiLanguage(){return language;}
export function t(key,values={}){return formatMessage(language,key,values);}
export function applyUILanguage(value){language=parseAppLanguage(value);document.documentElement.lang=language;}
