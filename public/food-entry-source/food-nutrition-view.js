import {escape as e} from '../dashboard-source/discover-ui.js';
import {formatMessage} from '../report-source/public/message-format.js';
import {nutrientDisplayName,nutrientGroupName} from '../report-source/public/nutrient-language.js';
import {displayValue,displayUnit} from '../dashboard-source/energy-display.js';
import {chartLibrary} from '../dashboard-source/chart-library.js';
const diarySymbol=()=>'<svg class="md-symbol" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';

// Shared nutrient display for diary items and unsaved food reviews.
export class FoodNutritionView{
 constructor({target,language,unit,catalog}){Object.assign(this,{target,language,unit,catalog});this.generation=0;this.m=(key,values)=>formatMessage(language,'mobileFood.'+key,values);}
 clear(){++this.generation;this.chart?.destroy();this.chart=null;}
 number(value,digits=1){return Number.isFinite(value)?value.toLocaleString(this.language,{maximumFractionDigits:digits}):'—';}
 async render(nutrition,{open=new Map(),isCurrent=()=>true,showHighlights=false}={}){
  this.clear();const generation=this.generation;this.open=open;
  const n=nutrition.totals,carb=nutrition.carbohydrate;
  const m=this.m,num=(v,d=1)=>this.number(v,d),energy=displayValue(n.calories,'kcal',this.unit);
  const meta=id=>this.catalog.find(row=>row.id===id)||{id,name:id,unit:'g'};
  const label=id=>id==='carbs'||id==='fat'?formatMessage(this.language,'mobileDiary.'+(id==='fat'?'fat':carb.definition?.mode==='net'?'netCarbohydrate':'carbs')):nutrientDisplayName(meta(id),this.language);
  const section=(id,title,body)=>`<details class="mf-section" data-mf-section="${e(id)}" ${(this.open.get(id)??['energy','macros'].includes(id))?'open':''}><summary><span>${e(title)}</span>${diarySymbol('chevron_right')}</summary>${body}</details>`;
  const partial=id=>{const coverage=id==='carbs'?carb.coverage:nutrition.nutrientCoverage[id];return coverage?.complete===false&&coverage?.known>0;};
  const value=id=>id==='carbs'?carb.value:n[id],target=id=>id==='carbs'?carb.target:nutrition.targets[id];
  const progress=id=>{
   const row=meta(id),amount=displayValue(value(id),row.unit,this.unit),goal=displayValue(target(id),row.unit,this.unit),pct=Number.isFinite(amount)&&goal>0?100*amount/goal:null;
   return `<div class="mf-nutrient mf-${e(id)}" data-mf-nutrient="${e(id)}"><div><span>${e(label(id))} <span class="mf-amount">${num(amount)}${partial(id)?'*':''} / ${num(goal)} ${e(displayUnit(row.unit,this.unit))}</span></span><span>${pct===null?'—':num(pct,0)+'%'}</span></div><progress max="100" value="${Math.max(0,Math.min(100,pct??0))}" aria-label="${e(label(id))}"></progress></div>`;
  };
  const macros=['protein','carbs','fat'];
  const allocation=nutrition.consumedEnergy,canPartition=allocation?.total>0&&allocation.values.unattributed===0&&Object.values(allocation.values).every(v=>Number.isFinite(v)&&v>=0);
  const legend=macros.map(id=>{const component=id==='carbs'?'carbohydrate':id,pct=canPartition?' ('+num(allocation.values[component]/allocation.total*100,0)+'%)':'';return `<div class="mf-${id}"><span>${e(label(id)+pct)}</span> · <strong>${num(value(id))}${partial(id)?'*':''} g</strong></div>`;}).join('');
  const groups=new Map(),hidden=new Set(nutrition.nutrientDisplay.hidden);
  const highlights=showHighlights?(nutrition.diaryDisplay?.highlights??[]):[];
  const highlighted=highlights.length?`<details class="mf-section" data-mf-section="highlights" ${(this.open.get('highlights')??true)?'open':''}><summary><span>${e(formatMessage(this.language,'diaryDisplay.highlightedTitle'))}</span>${diarySymbol('chevron_right')}</summary><div class="mf-highlights">${highlights.map(row=>{const pct=Number.isFinite(row.value)&&row.target>0?row.value/row.target*100:null;return `<div data-mf-highlight="${e(row.id)}"><div><span>${e(nutrientDisplayName(row,this.language))}</span><span>${pct===null?'—':num(pct,0)+'%'}${row.status==='partial'?'*':''}</span></div><progress max="100" value="${Math.max(0,Math.min(100,pct??0))}" aria-label="${e(nutrientDisplayName(row,this.language))}"></progress></div>`;}).join('')}</div></details>`:'';
  for(const row of this.catalog){if(['calories',...macros].includes(row.id)||hidden.has(row.id))continue;const group=row.category;if(!groups.has(group))groups.set(group,[]);groups.get(group).push(row);}
  this.target.innerHTML=section('energy',m('energy'),`<div class="mf-energy"><div class="mf-ring"><canvas aria-label="${e(m('energy'))}" role="img"></canvas><div><strong data-mf-energy>${num(energy,0)}</strong><span>${e(this.unit)}</span></div></div><div class="mf-legend">${legend}</div></div>`)+section('macros',m('macros'),['calories',...macros].map(progress).join(''))+[...groups].map(([group,rows])=>section(group,nutrientGroupName(group,this.language),rows.map(row=>progress(row.id)).join(''))).join('')+`<small class="mf-missing">${e(m('missing'))}</small>`;
  if(highlighted){const macrosSection=this.target.querySelector('[data-mf-section=macros]');macrosSection.insertAdjacentHTML('afterend',highlighted);}
  const Chart=await chartLibrary();if(generation!==this.generation||!isCurrent())return;
  const breakdown=nutrition.consumedEnergy,values=breakdown?.values,keys=['protein','carbohydrate','fat','alcohol','unattributed'];
  const usable=values&&Number.isFinite(breakdown.total)&&breakdown.total>0&&keys.every(id=>Number.isFinite(values[id])&&values[id]>=0);
  this.chart=new Chart(this.target.querySelector('canvas'),{type:'doughnut',data:{datasets:[{data:usable?keys.map(id=>values[id]):[1],backgroundColor:usable?['#59d18c','#44c9d6','#ba75cb','#f6be57','#6c7081']:['#45485a'],borderWidth:0}]},options:{animation:false,responsive:true,maintainAspectRatio:false,cutout:'85%',plugins:{legend:{display:false},tooltip:{enabled:false}}}});
 }
 dispose(){this.clear();}
}
