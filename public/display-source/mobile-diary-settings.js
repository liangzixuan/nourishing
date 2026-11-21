import {escape as e} from '../html.js';
import {t} from '../app-language.js';
import {diaryGroupSlots} from '../local-group-rename.js';
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
 return `<section class="mds-group">${toggle('showGroups',coreText('display.showGroups'),s.diaryGroups.showGroups)}${toggle('alwaysExpandMeals',t('mobileDisplay.alwaysExpandMeals'),s.alwaysExpandMeals)}</section>
  <p class="mds-meals-help">${e(coreText('display.expandMealsHelp'))}</p>
  <h2 class="mds-section-title">${e(t('mobileDisplay.diaryGroupsTitle'))}</h2><section class="mds-group">${row('groupSubtotals',t('mobileDisplay.groupSubtotals'),{none:t('settings.none'),calories:coreText('calories'),macros:t('settings.macroLabel'),summary:coreText('display.sameSummary')}[s.diaryTable.groupSubtotals])}${row('quickAdd',t('mobileDisplay.quickAdd'),'')}</section>
  <details class="mds-group mds-groups" data-display-groups ${groupsOpen?'open':''}><summary>${e(t('mobileDisplay.groups'))}</summary>${slots}</details>`;

}
export function mobileQuickAddSettings({settings:s,row}){return `<section class="mds-group">${s.groups.map(group=>row('quickAdd:'+group,group,t('shortcut.'+(s.diaryQuickAdd.shortcuts.find(item=>item.group===group)?.action??'food')))).join('')}</section>`;}
