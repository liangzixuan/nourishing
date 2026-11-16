import {WEIGHT_PROJECTION_VERSION,isWeightGuidance} from '../report-source/server/weight-guidance.mjs';
import {formatMessage} from '../report-source/public/message-format.js';
import {validateCycleOverlay} from '../report-source/server/cycle-overlay.mjs';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);
const known=value=>value===null||typeof value==='number'&&Number.isFinite(value);

/** Check the captured owner projection. Do not recalculate a forecast here. */
export function validateWeightGoalCapture(value,selectedDate,language='en'){
  if(value===null)return null;
  if(!object(value)||value.version!==WEIGHT_PROJECTION_VERSION||!date(value.date)||selectedDate!==undefined&&value.date!==selectedDate||!date(value.startDate)||!['kg','lb'].includes(value.unit)||!['maintain','planned','outside-calendar'].includes(value.status)||['startWeight','goalWeight','weeklyChange','adjustmentKcal','plannedWeight'].some(key=>typeof value[key]!=='number'||!Number.isFinite(value[key]))||['weeksToGoal','daysToGoal'].some(key=>!known(value[key])||value[key]!==null&&value[key]<0)||value.forecastDate!==null&&!date(value.forecastDate)||!Array.isArray(value.reasons)||!value.reasons.every(isWeightGuidance))throw Error(formatMessage(language,'weightView.invalidPlan'));
  if(!object(value.calendar)||!date(value.calendar.today)||!Number.isFinite(Date.parse(value.calendar.asOf))||typeof value.calendar.timeZone!=='string'||!['targetsWeightGoal','dashboardWeightGoal'].includes(value.cycleOverlayChart)||typeof value.cycleOverlayEnabled!=='boolean')throw Error(formatMessage(language,'weightView.invalidSettings'));
  const hasRange=value.forecastDate!==null;if(hasRange?(!object(value.range)||value.range.from!==value.startDate||value.range.to!==value.forecastDate):value.range!==null)throw Error(formatMessage(language,'weightView.invalidCalendar'));
  if(Object.hasOwn(value,'cycleOverlay')!==(hasRange&&value.cycleOverlayEnabled))throw Error(formatMessage(language,'weightView.invalidCycle'));
  if(value.cycleOverlay){validateCycleOverlay(value.cycleOverlay,value.range);if(['asOf','timeZone','today'].some(key=>value.cycleOverlay.calendar[key]!==value.calendar[key]))throw Error(formatMessage(language,'weightView.inconsistentCalendar'));}
  return value;
}

export function validateWeightProgressCapture(value,selectedDate,language='en'){
  if(value===null)return null;
  const numeric=['currentWeight','changeFromStart','distanceToGoal','progressPercent','plannedWeightAtMeasurement','deltaFromPlan'];
  if(!object(value)||value.version!==WEIGHT_PROJECTION_VERSION||!date(value.date)||selectedDate!==undefined&&value.date!==selectedDate||!['kg','lb'].includes(value.unit)||!['unselected','empty','invalid','before-start','maintain','in-progress','reached'].includes(value.status)||numeric.some(key=>!known(value[key]))||value.measurementDate!==null&&!date(value.measurementDate)||value.measurementTime!==null&&(typeof value.measurementTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.measurementTime))||value.updatedForecastDate!==null&&!date(value.updatedForecastDate)||!Array.isArray(value.reasons)||!value.reasons.every(isWeightGuidance))throw Error(formatMessage(language,'weightView.invalidProgress'));
  return value;
}
