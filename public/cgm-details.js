import {uiLanguage} from './app-language.js';
import {escape as e} from './html.js';
import {cgmStatistics} from './health-source/public/mobile-cgm-stats.js';
import {foodMarkerPlugin,foodPopupContent} from './health-source/public/mobile-cgm-foods.js';
import {mobileChartsMessages} from './health-source/public/locales/mobile-charts.js';
import {createMessageFormatter} from './report-source/public/message-formatter.js';
const format=createMessageFormatter(mobileChartsMessages),m=(key,values)=>format(uiLanguage(),key,values);
export function cgmDetails(card){return card.id==='cgm'?`<details class="cgm-details"><summary>${e(m('statistics'))}</summary>${cgmStatistics(card,{language:uiLanguage(),m})}</details>`:'';}
export function cgmFoodPlugin(card){
 if(card.id!=='cgm')return null;
 let popup=null;
 const plugin=foodMarkerPlugin(card,{label:foods=>m('foodMarker',{count:foods.length,time:foods[0].time}),onOpen:(foods,anchor)=>{
  popup?.remove();popup=document.createElement('div');popup.className='cgm-food-popup';popup.popover='auto';popup.setAttribute('aria-label',m('foodsLogged'));
  popup.innerHTML=`<button type="button" aria-label="${e(m('close'))}">×</button>`+foodPopupContent(foods,{language:uiLanguage()});anchor.closest('.chart-card').append(popup);popup.querySelector('button').onclick=()=>popup.hidePopover();popup.showPopover();
 }});
 return {...plugin,afterDestroy(chart){popup?.remove();plugin.afterDestroy?.(chart);}};
}
