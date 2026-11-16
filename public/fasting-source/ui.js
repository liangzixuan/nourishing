export {escape} from '../html.js';
import {escape as e} from '../html.js';
const paths={close:'m6 6 12 12M18 6 6 18',arrow_back:'m14 5-7 7 7 7',chevron_right:'m9 5 7 7-7 7',expand_more:'m6 9 6 6 6-6',help:'M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01'};
export const symbol=name=>`<svg class="dc-symbol-svg material-symbols-rounded" viewBox="0 0 24 24" width="24" height="24" fill="${name==='arrow_drop_down'?'currentColor':'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${name==='help'?'<circle cx="12" cy="12" r="10"/>':''}<path d="${name==='arrow_drop_down'?'m7 10 5 5 5-5z':paths[name]??paths.chevron_right}"/></svg>`;
export const button=(label,action,cls='',extra='')=>`<button type="button" class="dc-button ${cls}" data-discover="${action}" ${extra}>${label}</button>`;
export const row=(label,control)=>`<div class="dc-row">${label?`<span>${label}</span>`:''}${control}</div>`;
export const toggle=(label,key,value)=>row(label,`<input aria-label="${e(label)}" class="dc-switch" type="checkbox" role="switch" data-pref="${key}" ${value?'checked':''}>`);
export const widgetToggle=(label,key,value)=>toggle(label,key,value);
