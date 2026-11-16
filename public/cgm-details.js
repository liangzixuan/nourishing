import {cgmStatistics} from './health-source/public/mobile-cgm-stats.js';
import {foodMarkerPlugin,foodPopupContent} from './health-source/public/mobile-cgm-foods.js';
import {mobileChartsMessages} from './health-source/public/locales/mobile-charts.js';
import {createMessageFormatter} from './report-source/public/message-formatter.js';
const format=createMessageFormatter(mobileChartsMessages);
export function cgmDetails(card){return card.id==='cgm'?`<details class="cgm-details"><summary>Statistics</summary>${cgmStatistics(card,{language:'en',m:(key,values)=>format('en',key,values)})}</details>`:'';}
export function cgmFoodPlugin(card){
 if(card.id!=='cgm')return null;
 let popup=null;
 const plugin=foodMarkerPlugin(card,{label:foods=>`${foods.length} foods · ${foods[0].time}`,onOpen:(foods,anchor)=>{
  popup?.remove();popup=document.createElement('div');popup.className='cgm-food-popup';popup.popover='auto';popup.setAttribute('aria-label','Foods logged');
  popup.innerHTML='<button type="button" aria-label="Close foods">×</button>'+foodPopupContent(foods,{language:'en'});anchor.closest('.chart-card').append(popup);popup.querySelector('button').onclick=()=>popup.hidePopover();popup.showPopover();
 }});
 return {...plugin,afterDestroy(chart){popup?.remove();plugin.afterDestroy?.(chart);}};
}
