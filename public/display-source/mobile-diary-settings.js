import {escape as e} from '../html.js';
import {t} from '../app-language.js';
import {diaryGroupSlots} from '../local-group-rename.js';
import {diaryQuickAddAction} from '../local-diary-projection.js';
import {coreText} from '../core-cloud-messages.js';
export function mobileDiarySettings({settings:s,row,toggle,groupsOpen}){
 const slots=diaryGroupSlots(s).map((group,i)=>{
  const slot=i+1,label=coreText('display.groupSlot',{slot}),enabled=group!==null&&!s.diaryGroups.hiddenGroups.includes(group);
  return `<div class="mds-group-edit" data-group-slot="${slot}">
    <label for="group-name-${slot}">${e(label)}:</label>
    <input id="group-name-${slot}" type="text" data-group-name maxlength="100" value="${e(group??'')}" placeholder="${e(label)}">
    <input type="checkbox" role="switch" class="dc-switch" data-group-enabled aria-label="${e(label)}" ${enabled?'checked':''}>
  </div>`;
 }).join('');
 return `<section class="mds-group mds-diary-switches">${toggle('showGroups',t('mobileDisplay.showGroups'),s.diaryGroups.showGroups)}${toggle('alwaysExpandMeals',t('mobileDisplay.alwaysExpandMeals'),s.alwaysExpandMeals)}</section>
  <p class="mds-meals-help">${e(coreText('display.expandMealsHelp'))}</p>
  <h2 class="mds-section-title">${e(t('mobileDisplay.diaryGroupsTitle'))}</h2><section class="mds-group mds-diary-options">${row('groupSubtotals',t('mobileDisplay.groupSubtotals'),{none:t('settings.none'),calories:coreText('calories'),macros:t('settings.macroLabel'),summary:coreText('display.sameSummary')}[s.diaryTable.groupSubtotals])}${row('quickAdd',t('mobileDisplay.quickAdd'),'')}</section>
  <details class="mds-group mds-groups" data-display-groups ${groupsOpen?'open':''}><summary><span>${e(t('mobileDisplay.groups'))}</span><img src="/more-source/icons/chevron-right.svg" alt=""></summary>${slots}</details>`;

}
export function mobileQuickAddSettings({settings:s,row}){
 const groups=s.groups.map(group=>{
  const action=diaryQuickAddAction(s.diaryQuickAdd,group);
  return row('quickAdd:'+group,group,action==='all'?coreText('display.allShortcuts'):t('shortcut.'+action));
 });
 return `<section class="mds-group mds-quick-add">${groups.join('')}</section>`;
}
