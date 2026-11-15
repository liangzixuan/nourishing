import {createHash} from 'node:crypto';
import {healthNutritionFields,knownHealthNutrient,projectHealthNutrition} from './health-intake-nutrients.mjs';
export {healthNutritionFields} from './health-intake-nutrients.mjs';
import {date,parseReportTimeZone} from './calendar.mjs';
import {entryNutrientMeasurements,isExerciseEntry} from './nutrition.mjs';
import {initializeHealthExportIdentity,readHealthExportIdentity,healthIntakeClientId} from './health-export-identity.mjs';
import {isLoggedWater,loggedWaterMilliliters} from './water-measurement.mjs';
import {assertPlainIntakeExport} from './health-intake-policies.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const exact=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail('Supply the complete intake export selection.');};
export function parseHealthIntakeSelection(input){
 exact(input,['kind','from','to','timeZone','interval',...(input?.kind==='hydration'?['waterSource']:[])]);
 if(!['nutrition','hydration'].includes(input.kind)||input.interval!=='recorded-minute')fail('Select food or water export using its recorded one-minute interval.');
 const from=date(input.from),to=date(input.to),timeZone=parseReportTimeZone(input.timeZone);if(from>to)fail('Choose a valid date range.');
 if(input.kind==='hydration'&&!['logged','food','both'].includes(input.waterSource))fail('Choose logged water, food water or both.');
 return {kind:input.kind,from,to,timeZone,interval:input.interval,...(input.kind==='hydration'?{waterSource:input.waterSource}:{})};
}

export function projectIntakeRecords(state,selected,namespace,{entries,biometrics}={}){
  const records=[],skipped=[];
  const range=row=>row.date>=selected.from&&row.date<=selected.to;
  entries??=state.entries.filter(range);biometrics??=state.biometrics.filter(range);
  if(selected.kind==='nutrition'||selected.waterSource!=='logged'){
    const affected=entries.filter(row=>!isExerciseEntry(row)&&!Object.hasOwn(row,'source')).filter(row=>{
      const facts=entryNutrientMeasurements(state,row);
      return (row.quantity??row.amount??1)<0||Object.values(facts.nutrients).some(value=>typeof value==='number'&&Number.isFinite(value)&&value<0);
    });
    if(affected.length)fail(`This range contains ${affected.length} food subtraction or negative-nutrient ${affected.length===1?'entry':'entries'}. Health Connect cannot store negative nutrition or food-water records. Export a range without these corrections, or review the original logged quantities. No export plan was created; existing Health Connect records are unchanged.`,409);
  }
  const skip=(row,reason)=>skipped.push({id:row.id,date:row.date,reason});
  const eligible=row=>{if(Object.hasOwn(row,'source')){skip(row,'Source-linked record; not re-exported.');return false;}if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time??'')){skip(row,'No recorded time.');return false;}date(row.date);return true;};
  const base=(row,collection,name)=>({id:row.id,date:row.date,time:row.time,name,clientRecordId:healthIntakeClientId(namespace,selected.kind,collection,row.id)});
  if(selected.kind==='nutrition'||selected.waterSource!=='logged')for(const row of entries.filter(row=>!isExerciseEntry(row))){
   if(!eligible(row))continue;
   const facts=entryNutrientMeasurements(state,row);
   if(selected.kind==='hydration'){
    if(facts.attributions.length){skip(row,'Food water requires source credits that Health Connect hydration records cannot retain. Use the attributed Nourish data export.');continue;}
    if(!knownHealthNutrient(facts,'water')){skip(row,'Food water is missing or only partially known.');continue;}
    if(facts.nutrients.water>100000){skip(row,'Water exceeds the Health Connect volume range.');continue;}
    records.push({...base(row,'entries',facts.name+' — food water'),milliliters:facts.nutrients.water,attributions:[],details:[{name:'Water within food',value:facts.nutrients.water,unit:'mL'}],omitted:[]});continue;
   }
   const {nutrients,details,omitted}=projectHealthNutrition(facts).record;
   if(!Object.keys(nutrients).length){skip(row,'No completely known, supported nutrient values.');continue;}
   records.push({...base(row,'entries',facts.name),nutrients,attributions:facts.attributions,details,omitted});
  }
  if(selected.kind==='hydration'&&selected.waterSource!=='food')for(const row of biometrics.filter(isLoggedWater)){
   if(!eligible(row))continue;
   const ml=loggedWaterMilliliters(row);
   if(ml===null||ml>100000){skip(row,'Water unit or amount is unsupported (Health Connect range: 0–100000 mL).');continue;}
   records.push({...base(row,'biometrics','Logged water'),milliliters:ml,attributions:[],details:[{name:'Logged water',value:row.value,unit:row.unit??'mL'}],omitted:[]});
  }
  records.sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.clientRecordId.localeCompare(b.clientRecordId));skipped.sort((a,b)=>a.id.localeCompare(b.id));
  return {records,skipped};
}

export function healthIntakeExportOptions(timeZone='UTC'){parseReportTimeZone(timeZone);return {version:2,timeZone,interval:'recorded-minute',nutritionFields:healthNutritionFields,waterSources:['logged','food','both'],limitations:['Each recorded HH:MM is represented by [HH:MM, HH:MM + one minute); this is timestamp precision, not a measured eating or drinking duration.','Missing or partially known nutrients are omitted, not written as zero.','Vitamin A (RAE), folate (DFE), vitamin E activity basis and other unmatched nutrients are not mapped to generic SDK masses.','Food-water export includes water within food; choose logged water alone to export only recorded drinks. Food-water results requiring source credits are skipped because Health Connect hydration records cannot retain text.', 'Nutrition record names include the exact source credits shown in review.','Copied food and water diary events are distinct reviewed events. Native-source records are excluded to prevent re-export loops.']};}

export function createHealthIntakeExport({store,timeZone='UTC'}){
 initializeHealthExportIdentity(store.db);parseReportTimeZone(timeZone);
 const options=()=>healthIntakeExportOptions(timeZone);
 function preview(input){
  const selected=parseHealthIntakeSelection(input),state=store.read(),namespace=readHealthExportIdentity(store.db);
  assertPlainIntakeExport(store.db,state,selected,namespace);
  const {records,skipped}=projectIntakeRecords(state,selected,namespace);
  const facts={version:2,selection:selected,records,skipped},result={...facts,reviewToken:hash([namespace,facts])};
  if(Buffer.byteLength(JSON.stringify(result))>1048576)fail('This export exceeds the Android response limit. Select a smaller date range.',413);
  return result;
 }
 function verify(input){exact(input,['selection','reviewToken']);const current=preview(input.selection);if(current.reviewToken!==input.reviewToken)fail('Food, water or source definitions changed. Preview again before writing to Health Connect.',409);return {valid:true,reviewToken:current.reviewToken};}
 return {options,preview,verify};
}
