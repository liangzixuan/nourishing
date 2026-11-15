import {mergeSourceAttributions} from './catalog-source.mjs';
import {convertEnergy,parseEnergyUnit} from './energy-units.mjs';
import {captureCalendar} from './calendar.mjs';
import {calculateDailyNutrition} from './nutrition.mjs';
import {fastingScheduleView} from './fasting-schedules.mjs';
import {parseFastRecord} from './fasting-records.mjs';
import {captureFastingTiming} from './fasting-view.mjs';
import {homeWidgetLanguage} from './home-widget-language.mjs';
import {diaryRecordedAmount} from './public/diary-amount.js';

const progress=(value,target)=>value===null||target===null||target<=0?null:Math.max(0,Math.min(100,Math.round(value/target*100)));

/** Only display facts cross this boundary. No food names, notes, profile or source IDs. */
export function createHomeWidgetView(state,{now,timeZone,unit='kcal'}={}){
  parseEnergyUnit(unit);const calendar=captureCalendar(now,timeZone);
  const {number,text,nutrient,duration}=homeWidgetLanguage(state.settings?.appLanguage??'en');
  const day=calculateDailyNutrition(state,calendar.today),display=day.diaryDisplay;
  const value=(row,remaining=false)=>{
    const raw=remaining?row.remaining:diaryRecordedAmount(row);
    if(raw===null)return text('unknown');
    const converted=row.id==='calories'?convertEnergy(raw,'kcal',unit):raw;
    const marker=remaining&&row.remainingStatus==='upper-bound'?'≤ ':!remaining&&row.status==='partial'?'≥ ':'';
    return `${marker}${number(converted)} ${row.id==='calories'?unit:row.unit}`;
  };
  const energy=display.macros[0],target=energy.target===null?text('unknown'):`${number(convertEnergy(energy.target,'kcal',unit))} ${unit}`;
  const card=(remaining)=>({attributions:mergeSourceAttributions(day.attributions,day.macroTargets.attributions),title:text(remaining?(unit==='kcal'?'remaining':'remainingKj'):(unit==='kcal'?'consumed':'consumedKj')),value:value(energy,remaining),
    detail:[text('target',target),...display.macros.slice(1).map(row=>text('nutrient',nutrient(row),value(row,remaining)))].join('\n'),
    expanded:display.highlights.map(row=>text('nutrient',nutrient(row),value(row,remaining))).join('\n'),
    progress:progress(diaryRecordedAmount(energy),energy.target)});
  const schedules=fastingScheduleView(state,now,timeZone),timing=captureFastingTiming(state,calendar.asOf),active=timing.active;
  const next=schedules.schedules.map(row=>row.nextStart).filter(Boolean).sort((a,b)=>Date.parse(a)-Date.parse(b))[0];
  const completed=(state.fasts??[]).map(parseFastRecord).filter(row=>row.end!==null);
  const completedTime=completed.reduce((sum,row)=>sum+Date.parse(row.end)-Date.parse(row.start),0);
  let fasting={title:text('fasting'),value:text('inactive'),detail:next?text('next',next):text('unscheduled'),progress:null};
  if(active){
    fasting={title:text('fasting'),value:timing.status==='future-start'?text('future'):text('elapsed',duration(timing.elapsedSeconds*1000)),
      detail:text('start',active.start)+'\n'+(active.goalHours===null?text('open'):text('goal',number(active.goalHours))),
      progress:timing.progressPercent===null?null:Math.min(100,Math.round(timing.progressPercent))};
  }else if(next)fasting.value=text('until',duration(Date.parse(next)-now.getTime()));
  fasting.expanded=text(completed.length===1?'completedOne':'completedOther',number(completed.length))+'\n'+text('recorded',duration(completedTime));
  fasting.attributions=[];
  return {version:2,calendar,unit,cards:{consumed:card(false),remaining:card(true),fasting}};
}
