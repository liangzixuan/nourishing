import {escape as e} from '../html.js';
import {formatMessage} from '../report-source/public/message-format.js';

export function mobileFoodEntryMarkup({food,kind,entry,quantity,groupOptions,date,time,language,favorite,icons,source,sourceDetails,submitLabel,backLabel,canCopy,ingredientOnly=false}){
 const m=(key,values)=>formatMessage(language,'mobileFood.'+key,values);
 const button=(label,action,extra='')=>`<button type="button" data-action="${action}" ${extra}>${label}</button>`;
 return `<form data-form="diary-item" data-ui-language="${e(language)}" class="mf-form">
 <input type="hidden" name="id" value="${e(entry?.id||'')}"><input type="hidden" name="itemId" value="${e(food.id)}"><input type="hidden" name="kind" value="${kind}">
 <header class="mf-header">${button(icons.close,entry?'close-dialog':'picker-back',`aria-label="${e(backLabel??m(entry?'close':'back'))}"`)}<div class="mf-favorite">${favorite}</div><h2 id="mf-title">${e(food.name)}</h2><details class="mf-menu"><summary aria-label="${e(m('options'))}">${icons.more}</summary><button type="button" class="mf-menu-backdrop" data-mf-dismiss tabindex="-1" aria-label="${e(m('close'))}"></button><div class="mf-menu-items" role="dialog" aria-modal="true" aria-label="${e(m('options'))}"><button type="button" data-mf-favorite>${icons.star}<span></span></button>${canCopy?`<button type="button" data-mf-copy>${e(m('copy'))}</button>`:''}<label class="mf-menu-date" ${ingredientOnly?'hidden':''}>${icons.date}<span>${e(m('date'))}</span><input type="date" name="date" required aria-label="${e(m('date'))}" value="${e(date)}"></label></div></details></header>
 <section class="mf-controls">${quantity}<label class="mf-row" ${ingredientOnly?'hidden':''}><span>${e(m('timestamp'))}</span><span class="mf-time"><input type="time" name="time" value="${e(time)}" aria-label="${e(m('timestamp'))}" ${time?'':'disabled'}><input type="checkbox" data-mf-timestamp aria-label="${e(m('useTimestamp'))}" ${time?'checked':''}></span></label><label class="mf-row" ${ingredientOnly?'hidden':''}><span>${e(m('group'))}</span><select name="group">${groupOptions}</select></label></section>
 <div class="mf-source"><div data-mf-count></div><div>${e(m('dataSource'))}: ${button(e(source),'mobile-food-source')}</div><strong data-mf-basis></strong></div>
 <section data-mf-source hidden class="mf-source-details">${sourceDetails}</section>
 <div class="mf-preview" data-mf-preview aria-live="polite">${e(m('loading'))}</div>
 <footer class="mf-footer"><button type="submit" data-action="submit" class="primary">${e(submitLabel??m(entry?'save':'add'))}</button></footer></form>`;
}
