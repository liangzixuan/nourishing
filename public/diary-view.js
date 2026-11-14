// Existing mobile diary header and row renderers, extracted without behavioral changes.
import {escape as e} from './html.js';
// View-only state survives diary mutations and tab changes; no health data is stored here.
export const mobileDiarySession={page:0,groups:new Map()};
const button=(label,action,extra='')=>`<button type="button" data-action="${action}" ${extra}>${label}</button>`;
export const diarySymbol=name=>`<span class="md-symbol" aria-hidden="true">${e(name)}</span>`;

export function mobileDiaryHeader({date,today,complete,icons,menu,labels,language}){
 const label=date===today?labels.today:new Date(date+'T12:00:00').toLocaleDateString(language,{month:'short',day:'numeric'});
 return `<div class="md-date-bar">${button(icons.check,'complete-day',`class="md-complete ${complete?'is-complete':''}" data-completed="${!complete}" aria-label="${e(complete?labels.reopen:labels.complete)}"`)}<div class="md-date-controls">${button(icons.back,'prev-day',`aria-label="${e(labels.previous)}"`)}<button type="button" class="md-date-label" data-md-calendar aria-label="${e(labels.date)}">${e(label)}</button>${button(icons.chevron,'next-day',`aria-label="${e(labels.next)}"`)}</div>${menu.replace('>•••</summary>','>'+icons.more+'</summary>')}</div>`;
}

export function mobileDiaryGroups({groups,configuredGroups=groups,records,renderRow,selectBox,icons,labels,showGroups=true,subtotal=()=>''}){
 if(!showGroups)return `<section class="md-group"><table class="diary-table md-records"><tbody>${records.map(renderRow).join('')}</tbody></table></section>`;
 return groups.map(group=>{
  const rows=records.filter(row=>row.group===group),open=mobileDiarySession.groups.get(group)??rows.length>0,configured=configuredGroups.includes(group);
  return `<details class="md-group" data-md-group="${e(group)}" ${configured?`data-diary-drop-group="${e(group)}"`:''} ${open?'open':''}><summary>${button(icons.plus,configured?'group-quick-add':'add-food',`class="md-group-add" ${configured?`data-group="${e(group)}"`:''} aria-label="${e(labels.add)}: ${e(group)}"`)}${configured?selectBox(group):''}<strong>${e(group)}</strong>${subtotal(group)}<span class="md-group-chevron">${icons.chevron}</span></summary><table class="diary-table md-records"><tbody>${rows.map(renderRow).join('')}</tbody></table></details>`;
 }).join('');
}

export function mobileDiaryRecord({id,collection,name,meta,amount,icon,selectBox,action,extra=''}){
 return `<tr data-diary-record data-collection="${e(collection)}" data-id="${e(id)}"><td><div class="md-record">${selectBox}<button type="button" class="md-record-menu" data-md-context aria-label="${e(name)}: actions">${icon}</button><div class="md-record-text">${button(`<span class="food-name">${e(name)}</span>`,action,`class="entry-name" data-id="${e(id)}"`)}<div class="food-meta">${meta}</div>${extra}</div></div></td><td ${collection==='entries'?`data-diary-summary-entry="${e(id)}"`:''}>${amount}</td></tr>`;
}
