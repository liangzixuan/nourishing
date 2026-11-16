import {escape as e} from '../html.js';
import {moreIcon} from '../more-source/menu-view.js';
import {formatMessage} from '../report-source/public/message-format.js';
import {macroGuidanceText} from './macro-guidance.js';
export const ketoMessage=(language,key)=>formatMessage(language,'mobileKetoControls.'+key);
export function ketoProgramItems(language,selected){return ['rigorous','moderate','relaxed','custom'].map(id=>({id,label:formatMessage(language,'macroEditor.'+(id==='custom'?'custom':'preset.'+id)),selected:id===selected}))}
export function ketoProgramButton(language,selected){const items=ketoProgramItems(language,selected);return `<button type="button" class="mkc-program" data-keto-program aria-haspopup="menu" aria-expanded="false"><strong>${e(formatMessage(language,'macroEditor.program'))}</strong><span>${e(items.find(x=>x.id===selected).label)}${moreIcon('chevron-right')}</span></button>`}
export const ketoSourceSlot=()=>'<aside class="mkc-source" data-keto-source></aside>';
export function paintKetoSource(root,value,language){
 const slot=root.querySelector('[data-keto-source]');if(!slot)return;
 const notes=value?.mode==='keto'?value.reasons:null,recorded=notes?.some(n=>n.code==='recordedLean'),missing=notes?.some(n=>n.code==='proteinMissing');
 const kind=!notes?'pending':recorded?(missing?'recorded-missing':'recorded'):missing?'missing':'manual';slot.dataset.ketoSourceKind=kind;
 slot.innerHTML=`<span>${e(ketoMessage(language,kind))}</span><button type="button" data-keto-details aria-label="${e(ketoMessage(language,'details'))}" ${notes?'':'disabled'}>${moreIcon('help-circle')}</button>`;
 const manual=root.querySelector('[name=leanBodyMassKg]')?.closest('label');if(manual)manual.hidden=Boolean(recorded);
}
export function ketoDetailsMarkup(value,language){return `<ul class="mkc-reasons">${(value?.mode==='keto'?value.reasons:[]).map(note=>`<li>${e(macroGuidanceText(note,language))}</li>`).join('')}</ul>`}
