import {uiLanguage} from './app-language.js';
import {dc} from './discover-cloud-messages.js';
import {dashboardSettingsMarkup,widgetToggle} from './dashboard-source/discover-settings-ui.js';

/** Shared settings controls for Discover and More → Display. */
export function renderDashboardSettings({host,data,onSave,onStreak,coachAvailable=true}){
 host.innerHTML=dashboardSettingsMarkup(data.preferences,data.dashboard,uiLanguage())+'<p data-dashboard-status class="sheet-message" role="alert"></p>';
 const extraWidgets=widgetToggle(dc('showGlucose'),'glucose',data.dashboard.widgets.glucose)+widgetToggle(dc('showCycleTracking'),'cycle',data.dashboard.widgets.cycle);
 host.querySelector('.dc-dashboard-settings').insertAdjacentHTML('afterend',`<div class="dc-dashboard-extras">${extraWidgets}</div>`);
 const coach=host.querySelector('[data-widget=coach]');if(!coachAvailable){coach.disabled=true;coach.setAttribute('aria-label',dc('coachUnavailable'));coach.closest('.dc-row').querySelector('span').textContent=dc('coachUnavailable');}
 host.onchange=async event=>{const el=event.target,key=el.dataset.widget??el.dataset.pref;if(!key)return;const type=el.dataset.widget?'dashboard.widgets':'dashboard.preferences';const alert=host.querySelector('[role=alert]');if(alert)alert.textContent='';try{await onSave(type,{patch:{[key]:el.checked}});}catch(error){if(host.isConnected){el.checked=!el.checked;if(alert)alert.textContent=error.message;}}};
 host.onclick=event=>{if(event.target.closest('[data-discover=streak-settings]'))onStreak();};
}
