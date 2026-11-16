import {coreText} from '../core-cloud-messages.js';
import {t} from '../app-language.js';
// View-only extraction from the local mobile-more.js. The adapter owns destinations.
import {escape as e} from '../html.js';
export const moreIcon=(name,cls='')=>`<img class="${cls}" src="/more-source/icons/${name}.svg" alt="">`;
export const moreRow=(id,label,icon=null)=>`<button type="button" class="mm-row" data-more-open="${e(id)}">${icon?moreIcon(icon,'mm-row-icon'):''}<span>${e(label)}</span>${moreIcon('chevron-right','mm-chevron')}</button>`;
export const moreLink=(label,path,external=false)=>`<a class="mm-row" href="${e(path)}" ${external?'target="_blank" rel="noopener noreferrer"':''}><span>${e(label)}</span>${moreIcon('chevron-right','mm-chevron')}</a>`;
export const moreGroup=(content,cls='')=>`<section class="mm-group ${cls}">${content}</section>`;
export const moreBackHeader=title=>`<div class="mm-child-header"><button type="button" data-more-back aria-label="${e(t('mobileMore.back'))}">${moreIcon('chevron-left')}</button><h1>${e(title)}</h1><span></span></div>`;
export const moreHomeHeader=(identity,query)=>`<div class="mm-home-header"><h1>${e(t('mobileMore.title'))}</h1><div class="mm-identity">${e(identity)}</div><label class="mm-search">${moreIcon('magnify')}<input data-more-search type="search" value="${e(query)}" placeholder="${e(t('mobileMore.search'))}" aria-label="${e(coreText('more.search'))}"></label></div>`;
