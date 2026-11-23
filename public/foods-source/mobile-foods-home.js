import {escape as e} from './discover-ui.js';
import {formatMessage} from './message-format.js';
const message=language=>(key,values)=>formatMessage(language,'mobileFoods.'+key,values);
const utensil='<path d="M5 1v6a3 3 0 0 0 2.1 2.8v19h2.1v-19A3 3 0 0 0 11.3 7V1M7 1v5m2.2-5v5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 .6c4.8 0 6.7 4.6 6.7 9.4v6.3h-3.5V29h-3.5V1z" fill="currentColor"/>';
const question='<path d="M10.4 11.1c.3-2.7 2.4-4.3 5.3-4.3 3.5 0 5.6 1.6 5.6 4.3 0 2.3-1.4 3.5-3 4.4-1.4.8-1.8 1.3-1.8 2.7h-3.7c0-2.8.7-3.8 2.5-5 1.5-.9 2-1.4 2-2.3 0-.9-.7-1.5-1.7-1.5-1.1 0-1.8.8-1.9 2.1z"/><circle cx="14.8" cy="21.8" r="2.1"/>';
const icons={
  meals:`<circle cx="15" cy="15" r="15" fill="#00a3a1"/><g color="#262a3b" transform="translate(4 7.5) scale(.78)">${utensil}</g>`,
  recipes:`<g color="#328e8e" transform="translate(1.5)">${utensil}</g>`,
  foods:'<path d="M15 9c-3.3-1.6-5.8-2.6-8.5-1.6C1.3 9.3.8 16 3.2 22.2c1.7 4.4 3.9 7.7 7.7 7.7 1.7 0 2.7-.6 4.1-.6s2.5.6 4.1.6c3.8 0 6.1-3.3 7.7-7.7 2.3-6.1 1.7-12.7-3.5-14.8-2.5-1-5.2.2-8.3 1.6z" fill="#ea3b04"/><path d="M15.6 7.5c-3.5.5-6.3-1.5-7-6.4 3.8-.8 6.6.8 7.5 4.3C17 2 18.4.2 20.8 1.2c2 1 .9 2.5-.4 3.1-1.5.7-1.9 1.9-2.1 3.1l-.2 1.2h-2.5z" fill="#13b55b"/>',
  repeats:'<circle cx="15" cy="15" r="15" fill="#d5f3df"/><path d="M8 13a7 7 0 1 1 0 5m0-8v3.6h3.6" fill="none" stroke="#08a64e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  suggest:`<circle cx="15" cy="15" r="15" fill="#ffad00"/><g fill="#262a3b">${question}</g>`,
  oracle:`<circle cx="15" cy="13" r="12.5" fill="#ffc659"/><path d="M7.5 24h15v3.5h-15zM6 27h18l1.5 2.5h-21z" fill="#ffad00"/><g transform="translate(2 1.2) scale(.81)" fill="#262a3b">${question}</g>`,
 };

export function mobileFoodsHeader(language,icon){const m=message(language);return `<div class="mfh-header"><h1>${e(m('title'))}</h1><button type="button" data-action="add-food" aria-label="${e(m('search'))}">${icon('search')}</button></div>`;}
export function mobileFoodsHome(language,icon){
 const m=message(language),create=(kind,extra='')=>`<button type="button" class="mfh-create" data-action="new-${kind}">${e(m('create.'+kind))}</button>${extra}`;
 const tab=`<button type="button" data-action="add-food" data-food-category="custom">${e(m('customTab'))}</button>`;
 const shared=e(m('sharedHelp')).replace('{tab}',tab);
 const cards=[
  ['meals','data-action="food-tab" data-tab="meals"',create('meal')],
  ['recipes','data-action="food-tab" data-tab="recipes"',create('recipe',`<button type="button" class="mfh-import" data-action="recipe-import">${e(m('importRecipe'))}</button>`)],
  ['foods','data-action="food-tab" data-tab="foods"',create('food')],
  ['repeats','data-action="navigate" data-view="repeats"',''],
  ['suggest','data-action="foods-insight" data-section="suggest"',''],
  ['oracle','data-action="foods-insight" data-section="oracle"','']
 ];
 return `<div class="mfh-home">${cards.map(([id,action,actions])=>`<section class="mfh-card mfh-${id}"><button type="button" class="mfh-link" ${action}><span class="mfh-icon" aria-hidden="true"><svg viewBox="0 0 30 30" aria-hidden="true">${icons[id]}</svg></span><span class="mfh-copy"><strong>${e(m(id))}</strong><span>${e(m(id+'.help'))}</span></span><span class="mfh-chevron" aria-hidden="true">${icon('chevron')}</span></button>${actions?`<div class="mfh-actions">${actions}</div>`:''}</section>`).join('')}<p class="mfh-shared">${icon('search')}<span>${shared}</span></p></div>`;
}
