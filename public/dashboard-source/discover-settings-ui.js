import {formatMessage} from './message-format.js';
import {escape as e,symbol as icon,button as b,row,toggle} from './discover-ui.js';
export const widgetToggle=(label,key,value)=>row(label,`<input aria-label="${e(label)}" class="dc-switch" type="checkbox" role="switch" data-widget="${key}" ${value?'checked':''}>`);
export function dashboardSettingsMarkup(p,dashboard,language="en"){
 const text=key=>formatMessage(language,"discover."+key);
 const w=dashboard.widgets;
 return `<div class="dc-group dc-dashboard-settings">${widgetToggle(text('show.nutrition'),'nutrition',w.nutrition)}${toggle(text('show.news'),'newsVisible',p.newsVisible)}${widgetToggle(text('show.coach'),'coach',w.coach)}${widgetToggle(text('show.fasting'),'fasting',w.fasting)}${widgetToggle(text('show.energy'),'energy',w.energy)}${widgetToggle(text('show.weight'),'weight',w.weight)}${widgetToggle(text('show.sleep'),'sleep',w.sleep)}${row('',b('<strong>'+e(text('title.streak-settings'))+'</strong>'+icon('chevron_right'),'streak-settings'))}${toggle(text('show.weightGoal'),'weightGoalVisible',p.weightGoalVisible)}</div>`;
}
export function streakSettingsMarkup(streak,visible,language="en"){
 const text=(key,values)=>formatMessage(language,"discover."+key,values);
 return `${widgetToggle(text('show.streak'),'streaks',visible)}<section class="dc-reset-streak"><h2>${e(text("streak.reset"))}</h2><p>${e(text("streak.resetHelp"))}</p><p>${e(text("streak.resetLimit"))}</p><form id="dc-streak-form">${row(text('streak.resetTo'),`<span class="dc-streak-input"><input name="count" type="number" min="0" max="100000" step="1" value="0" inputmode="numeric" required aria-label="${e(text('streak.resetTo'))}"><span>${e(text('streak.days'))}</span></span>`)}<p class="dc-current-streak">${e(text("streak.current",{count:streak?.current??0}))}</p>${b(text('streak.reset'),'reset-streak','dc-pill')}</form></section>`;
}
export function newsfeedMarkup(language="en"){const text=key=>formatMessage(language,"discover."+key);return `<section class="dc-card dc-news-empty"><div class="dc-badge">${icon('campaign')}</div><div><h2>${e(text("news.empty"))}</h2><p>${e(text("news.emptyHelp"))}</p></div></section>`;}
