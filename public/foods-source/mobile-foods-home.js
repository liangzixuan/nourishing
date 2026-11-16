import {escape as e} from './discover-ui.js';
import {formatMessage} from './message-format.js';
const message=language=>(key,values)=>formatMessage(language,'mobileFoods.'+key,values);
export function mobileFoodsHeader(language,icon){const m=message(language);return `<div class="mfh-header"><h1>${e(m('title'))}</h1><button type="button" data-action="add-food" aria-label="${e(m('search'))}">${icon('search')}</button></div>`;}
export function mobileFoodsHome(language,icon){
 const m=message(language),create=(kind,extra='')=>`<button type="button" class="mfh-create" data-action="new-${kind}">${e(m('create.'+kind))}</button>${extra}`;
 const cards=[
  ['meals','food','data-action="food-tab" data-tab="meals"',create('meal')],
  ['recipes','food','data-action="food-tab" data-tab="recipes"',create('recipe',`<button type="button" class="mfh-import" data-action="recipe-import">${e(m('importRecipe'))}</button>`)],
  ['foods','apple','data-action="food-tab" data-tab="foods"',create('food')],
  ['repeats','repeat','data-action="navigate" data-view="repeats"',''],
  ['suggest','spark','data-action="foods-insight" data-section="suggest"',''],
  ['oracle','target','data-action="foods-insight" data-section="oracle"','']
 ];
 return `<div class="mfh-home">${cards.map(([id,symbol,action,actions])=>`<section class="mfh-card mfh-${id}"><button type="button" class="mfh-link" ${action}><span class="mfh-icon" aria-hidden="true">${symbol==='apple'?'<span class="dc-nav-icon dc-nav-icon-apple"></span>':icon(symbol)}</span><span class="mfh-copy"><strong>${e(m(id))}</strong><span>${e(m(id+'.help'))}</span></span><span class="mfh-chevron" aria-hidden="true">${icon('chevron')}</span></button>${actions?`<div class="mfh-actions">${actions}</div>`:''}</section>`).join('')}</div>`;
}
