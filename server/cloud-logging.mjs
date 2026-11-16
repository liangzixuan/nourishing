import {isStreakAction,captureLoggingRecords,recordLoggingActivity} from './domain/logging-streaks.mjs';
import {captureCalendar} from './domain/calendar.mjs';

const sourceAction=type=>({'food.multi.add':'entry.add','barcode.log':'entry.add','photo.log':'photo.save','meal.log':'entry.add','biometric.log':'biometric.add'}[type]??type);
export function beginCloudLogging(state,type){return isStreakAction(sourceAction(type))?captureLoggingRecords(state):null;}
export async function loggingCalendar(db,owner,context){
 if(context.asOf&&context.timeZone)return captureCalendar(new Date(context.asOf),context.timeZone);
 let profile;try{profile=await db.getRow({databaseId:'nourishing',tableId:'profiles',rowId:owner});}catch(error){if(error.code!==404)throw error;}
 return captureCalendar(new Date(),profile?.timeZone??'UTC');
}
export function finishCloudLogging(state,before,type,calendar){
 if(before)recordLoggingActivity(state,before,{action:sourceAction(type),source:'online',now:new Date(calendar.asOf),timeZone:calendar.timeZone});
}
