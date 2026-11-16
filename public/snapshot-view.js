import {snapshotText as m,dc} from './discover-cloud-messages.js';
import {uiLanguage,t} from './app-language.js';
import {escape as e} from './html.js';
const icon=name=>`<img src="/snapshot-source/${name}.svg" alt="">`;
// Source MobileSnapshots presentation, with cloud media URLs and command selectors.
export function snapshotListMarkup(rows,{busy,media,dateLabel,facts}){
 const add=`<button type="button" class="ms-add" data-snapshot-add ${busy?'disabled':''}>${e(m('add'))}</button>`;
 return rows.length?add+rows.map(row=>`<article class="ms-card snapshot-card" data-snapshot-id="${e(row.id)}"><header><h2>${e(dateLabel(row.date))}</h2><button type="button" data-snapshot-options="${e(row.id)}" aria-label="${e(dc('snapshotOptions'))}" ${busy?'disabled':''}>${icon('dots-vertical')}</button></header><button type="button" class="ms-image" data-snapshot-view="${e(row.id)}" aria-label="${e(dc('snapshotView'))}"><img loading="lazy" src="${e(media(row))}" alt="${e(row.title||t('progress.photo'))}" referrerpolicy="no-referrer"></button><footer><div class="ms-caption">${row.title?`<strong>${e(row.title)}</strong>`:''}${row.note?`<p>${e(row.note)}</p>`:''}</div><dl class="ms-facts snapshot-facts">${facts(row)}</dl></footer></article>`).join(''):`<section class="ms-empty snapshot-empty"><span>${icon('camera-outline')}</span><div><h2>${e(m('empty'))}</h2><p>${e(m('emptyHint'))}</p></div></section>`+add;
}
