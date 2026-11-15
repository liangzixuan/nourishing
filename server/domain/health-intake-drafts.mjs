import {createHash} from 'node:crypto';
import {date,parseReportTimeZone} from './calendar.mjs';
import {ReviewSaveStore,saveIdentity} from './review-save-store.mjs';
import {createIntakeCorrectionReview} from './health-intake-correction-review.mjs';
import {entryNutrientMeasurements,isExerciseEntry} from './nutrition.mjs';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const has=db=>!!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='health_intake_drafts'").get();
const token=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const key=(kind,day)=>{if(!['nutrition','hydration'].includes(kind))fail('Choose food nutrients or food water.');return {kind,date:date(day)};};
const revision=value=>Number.isSafeInteger(value)&&value>=0;
const negative=facts=>Object.values(facts.nutrients).some(value=>typeof value==='number'&&value<0);
export function parseIntakeDraftSelection(value){
 if(!exact(value,['kind','date','timeZone','groups']))fail('Invalid saved correction selection.');
 key(value.kind,value.date);parseReportTimeZone(value.timeZone);
 if(!Array.isArray(value.groups)||!value.groups.length)fail('A saved draft needs at least one correction group.');
 const seen=new Set();
 for(const group of value.groups){
  if(!exact(group,['anchorId','entryIds'])||typeof group.anchorId!=='string'||!Array.isArray(group.entryIds)||group.entryIds.length<2||!group.entryIds.includes(group.anchorId))fail('Invalid saved correction group.');
  for(const id of group.entryIds){if(typeof id!=='string'||!id.trim()||seen.has(id))fail('Saved correction entries must have distinct identities.');seen.add(id);}
 }
 return value;
}
function parseRow(row){
 const value=JSON.parse(row.body);key(row.kind,row.day);
 if(!exact(value,['kind','date','revision','selection','draftToken','updatedAt'])||value.kind!==row.kind||value.date!==row.day||!revision(value.revision)||value.revision<1||typeof value.updatedAt!=='string'||!Number.isFinite(Date.parse(value.updatedAt)))fail('Invalid stored correction draft.');
 if(value.selection===null){if(value.draftToken!==null)fail('Invalid cleared correction draft.');}
 else {parseIntakeDraftSelection(value.selection);if(value.selection.kind!==row.kind||value.selection.date!==row.day||!token(value.draftToken))fail('Invalid correction draft identity.');}
 return value;
}
export function initializeIntakeDrafts(db){db.exec('CREATE TABLE IF NOT EXISTS health_intake_drafts (kind TEXT NOT NULL,day TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,day))');}
/** Stale selections are retained. A backup must not treat them as write authorization. */
export function readIntakeDrafts(db){
 if(!has(db))return [];
 const size=db.prepare('SELECT coalesce(sum(length(CAST(body AS BLOB))),0) AS bytes,max(length(CAST(body AS BLOB))) AS largest FROM health_intake_drafts').get();
 if(size.bytes>20000000||size.largest>1048576)fail('Correction drafts exceed the workspace record or Android response limit.');
 return db.prepare('SELECT kind,day,body FROM health_intake_drafts ORDER BY kind,day').all().map(parseRow);
}
/** Called inside the backup owner's existing transaction. */
export function restoreIntakeDrafts(source,target){
 const rows=readIntakeDrafts(source);initializeIntakeDrafts(target);target.exec('DELETE FROM health_intake_drafts');
 for(const row of rows)target.prepare('INSERT INTO health_intake_drafts VALUES(?,?,?)').run(row.kind,row.date,JSON.stringify(row));
 return rows.length;
}
export function createIntakeDrafts({store,timeZone='UTC',now=()=>new Date()}){
 initializeIntakeDrafts(store.db);const saves=new ReviewSaveStore(store.db),review=createIntakeCorrectionReview({store});parseReportTimeZone(timeZone);
 const read=(kind,day)=>{key(kind,day);const row=store.db.prepare('SELECT kind,day,body FROM health_intake_drafts WHERE kind=? AND day=?').get(kind,day);return row?parseRow(row):null;};
 function options(input){
  if(!exact(input,['kind','date']))fail('Select an intake type and date.');const selected=key(input.kind,input.date),saved=read(selected.kind,selected.date);
  const state=store.read(),entries=state.entries.filter(row=>row.date===selected.date&&!isExerciseEntry(row)&&!Object.hasOwn(row,'source')).map(row=>{
   const facts=entryNutrientMeasurements(state,row),amount=row.quantity??row.amount??1;
   return {id:row.id,name:facts.name,time:row.time??null,amount,unit:row.quantity!==undefined?(row.unit??'unit unavailable'):'serving',subtraction:amount<0||negative(facts),anchorEligible:amount>0&&!negative(facts)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time??''),attributions:facts.attributions};
  });
  return {version:1,...selected,timeZone:saved?.selection?.timeZone??timeZone,saveScope:saves.saveScope(),revision:saved?.revision??0,saved,entries,executable:false};
 }
 function preview(input){
  if(!exact(input,['selection','expectedRevision'])||!revision(input.expectedRevision))fail('Supply the draft selection and loaded revision.');
  const selected=parseIntakeDraftSelection(input.selection),baseRevision=read(selected.kind,selected.date)?.revision??0;
  if(baseRevision!==input.expectedRevision)fail('This draft changed in another view. Reload it before reviewing.',409);
  const result=review.preview(selected);return {...result,baseRevision,saveScope:saves.saveScope()};
 }
 function mutate(input,clear){
  const keys=clear?['kind','date','expectedRevision','save']:['selection','draftToken','expectedRevision','save'];
  if(!exact(input,keys)||!revision(input.expectedRevision))fail('Supply the captured draft and revision.');
  const identity=saveIdentity(input.save),selected=clear?key(input.kind,input.date):parseIntakeDraftSelection(input.selection),digest=hash(input),operation=clear?'intake-draft-clear':'intake-draft-save';
  let result;
  store.update(()=>{
   const previous=saves.savedReceipt(operation,identity,digest);if(previous){result={...previous,replayed:true};return;}
   const current=read(selected.kind,selected.date),currentRevision=current?.revision??0;
   if(currentRevision!==input.expectedRevision)fail('This draft changed in another view. Reload it before saving.',409);
   let captured=null;
   if(clear){if(!current?.selection||identity.reviewToken!==current.draftToken)fail('Reload the saved draft before discarding it.',409);}
   else {
    if(!token(input.draftToken)||identity.reviewToken!==input.draftToken)fail('Save the exact correction preview.');
    review.verify({selection:selected,draftToken:input.draftToken});captured=selected;
   }
   if(currentRevision>=Number.MAX_SAFE_INTEGER)fail('Correction draft revision exhausted.',409);
   const row={kind:selected.kind,date:selected.date,revision:currentRevision+1,selection:captured,draftToken:clear?null:input.draftToken,updatedAt:now().toISOString()};
   const body=JSON.stringify(row);if(Buffer.byteLength(body)>1048576)fail('The saved draft exceeds the Android response limit.',413);
   store.db.prepare('INSERT INTO health_intake_drafts VALUES(?,?,?) ON CONFLICT(kind,day) DO UPDATE SET body=excluded.body').run(row.kind,row.date,body);
   readIntakeDrafts(store.db);
   result={version:1,saved:row,replayed:false,executable:false};saves.recordSave(operation,identity,digest,result);
  });
  return result;
 }
 return {options,preview,save:input=>mutate(input,false),clear:input=>mutate(input,true)};
}
