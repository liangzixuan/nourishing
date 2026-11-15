import Big from './../vendor/big.js/7.0.1/big.mjs';
import {WEIGHT_PROJECTION_VERSION,captureWeightGuidance} from './weight-guidance.mjs';
import {date as calendarDate} from './calendar.mjs';

const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const keys=['startDate','startWeight','goalWeight','unit','weeklyChange'];
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const dayMilliseconds=86400000;
const epoch=date=>Date.parse(`${date}T12:00:00Z`);
const lastDay=epoch('9999-12-31');
// Independent constructors keep precision choices local. Finite Number inputs
// have at most 324 fractional decimal places; this also retains small rates.
const Decimal=Big();Decimal.DP=340;
const Ceiling=Big();Ceiling.DP=0;Ceiling.RM=Ceiling.roundUp;
const number=value=>{const result=Number(value.toString());return Number.isFinite(result)?result:null;};

/** Reviewed planning inputs only; no profile or measurement inference. */
export function parseWeightGoal(value){
  if(value===null||value===undefined)return null;
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('Choose the required weight-goal fields only.');
  const startDate=calendarDate(value.startDate);
  if(!['kg','lb'].includes(value.unit))fail('Choose kilograms (kg) or pounds (lb).');
  for(const key of ['startWeight','goalWeight'])if(!finite(value[key])||value[key]<=0||value[key]>1000000)fail('Enter positive starting and goal weights within the supported measurement range.');
  if(!finite(value.weeklyChange)||Math.abs(value.weeklyChange)>1000000)fail('Enter a finite signed weekly weight change within the supported measurement range.');
  const direction=Math.sign(value.goalWeight-value.startWeight);
  if(Math.sign(value.weeklyChange)!==direction)fail('Use a negative weekly change for loss, a positive change for gain, or zero when starting and goal weights are equal.');
  return {startDate,startWeight:value.startWeight,goalWeight:value.goalWeight,unit:value.unit,weeklyChange:value.weeklyChange};
}

/** Capture a linear plan for one date. Its values are not measured progress. */
export function projectWeightGoal(value,date){
  calendarDate(date);const goal=parseWeightGoal(value);if(goal===null)return null;
  const start=new Decimal(goal.startWeight.toString()),end=new Decimal(goal.goalWeight.toString()),rate=new Decimal(goal.weeklyChange.toString());
  const reasons=[captureWeightGuidance('plan.linear'),captureWeightGuidance('plan.approximation'),captureWeightGuidance('plan.active')];
  const base={version:WEIGHT_PROJECTION_VERSION,date,...goal,adjustmentKcal:number((goal.unit==='kg'?rate.div('0.45359237'):rate).times(500))};
  if(rate.eq(0))return {...base,weeksToGoal:0,daysToGoal:0,forecastDate:null,plannedWeight:goal.startWeight,status:'maintain',reasons};
  const distance=end.minus(start).abs(),weeks=distance.div(rate.abs());
  // Calculate the ceiling directly with exact decimal inputs. Rounding an
  // intermediate Number can move an arrival date by one day.
  const days=new Ceiling(distance.times(7).toString()).div(rate.abs().toString());
  const availableDays=(lastDay-epoch(goal.startDate))/dayMilliseconds;
  const withinCalendar=days.lte(availableDays),forecastDate=withinCalendar?new Date(epoch(goal.startDate)+Number(days.toString())*dayMilliseconds).toISOString().slice(0,10):null;
  const elapsedDays=Math.max(0,(epoch(date)-epoch(goal.startDate))/dayMilliseconds);
  const progress=rate.times(elapsedDays).div(7),reached=progress.abs().gte(distance);
  const plannedWeight=reached?goal.goalWeight:number(start.plus(progress));
  if(!withinCalendar)reasons.push(captureWeightGuidance('plan.calendar'));
  return {...base,weeksToGoal:number(weeks),daysToGoal:number(days),forecastDate,plannedWeight,status:withinCalendar?'planned':'outside-calendar',reasons};
}

/** Measured progress is separate from the reviewed linear plan. */
export function projectWeightGoalProgress(value,composition,date){
  calendarDate(date);const goal=parseWeightGoal(value);if(goal===null)return null;
  const reasons=[],weight=composition?.weight,status=weight?.status??'unselected';
  const base={version:WEIGHT_PROJECTION_VERSION,date,unit:goal.unit,status,currentWeight:null,measurementDate:null,measurementTime:null,changeFromStart:null,distanceToGoal:null,progressPercent:null,plannedWeightAtMeasurement:null,deltaFromPlan:null,updatedForecastDate:null,reasons};
  if(status!=='known'){if(status!=='unselected')reasons.push(captureWeightGuidance('progress.required'));return base;}
  if(!finite(composition.weightKg)||composition.weightKg<=0||!weight.reading){return {...base,status:'invalid',reasons:[captureWeightGuidance('progress.invalid')]};}
  const current=new Decimal(composition.weightKg),measured=goal.unit==='lb'?current.div('0.45359237'):current,currentWeight=number(measured);
  const measurementDate=calendarDate(weight.reading.date),measurementTime=weight.reading.time??null;
  if(measurementDate>date)fail('Weight progress requires a reading on or before the viewed date.');
  const known={...base,currentWeight,measurementDate,measurementTime};
  if(measurementDate<goal.startDate)return {...known,status:'before-start',reasons:[captureWeightGuidance('progress.before')]};
  const start=new Decimal(goal.startWeight),end=new Decimal(goal.goalWeight),direction=end.cmp(start),change=measured.minus(start),plan=projectWeightGoal(goal,measurementDate);
  const result={...known,status:direction===0?'maintain':(direction<0?measured.lte(end):measured.gte(end))?'reached':'in-progress',changeFromStart:number(change),distanceToGoal:number(end.minus(measured).abs()),progressPercent:direction===0?null:number(change.div(end.minus(start)).times(100)),plannedWeightAtMeasurement:plan.plannedWeight,deltaFromPlan:plan.plannedWeight===null?null:number(measured.minus(plan.plannedWeight))};
  if(result.status==='in-progress'){
    reasons.push(captureWeightGuidance('progress.linear'));
    if(currentWeight>1000000||currentWeight===null)reasons.push(captureWeightGuidance('progress.range'));
    else{
      const forecast=projectWeightGoal({...goal,startDate:measurementDate,startWeight:currentWeight},measurementDate);result.updatedForecastDate=forecast.forecastDate;
      if(forecast.status==='outside-calendar')reasons.push(captureWeightGuidance('progress.calendar'));
    }
  }
  return result;
}
