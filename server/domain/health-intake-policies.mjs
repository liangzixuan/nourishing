import {date,parseReportTimeZone} from './calendar.mjs';
import {parseIntakeDraftSelection} from './health-intake-drafts.mjs';
import {readHealthExportIdentity,validateHealthExportNamespace} from './health-export-identity.mjs';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const rowKey=row=>JSON.stringify([row.namespace,row.kind,row.date]);
const has=db=>!!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='health_intake_policies'").get();
const ids=value=>Array.isArray(value)&&value.every(id=>typeof id==='string'&&id.trim())&&new Set(value).size===value.length;
export function initializeIntakePolicies(db){db.exec('CREATE TABLE IF NOT EXISTS health_intake_policies (namespace TEXT NOT NULL,kind TEXT NOT NULL,day TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(namespace,kind,day))');}
function parse(value){
 if(!exact(value,['namespace','kind','date','timeZone','revision','groups','memberIds']))fail('Invalid intake correction history.');
 validateHealthExportNamespace(value.namespace);date(value.date);parseReportTimeZone(value.timeZone);
 if(!['nutrition','hydration'].includes(value.kind)||!Number.isSafeInteger(value.revision)||value.revision<1||!Array.isArray(value.groups)||!ids(value.memberIds)||!value.memberIds.length)fail('Invalid intake correction history identity or revision.');
 if(value.groups.length)parseIntakeDraftSelection({kind:value.kind,date:value.date,timeZone:value.timeZone,groups:value.groups});
 const members=new Set(value.memberIds);if(value.groups.some(group=>group.entryIds.some(id=>!members.has(id))))fail('Correction history is missing an active member.');
 return value;
}
function validateRows(rows){
 const active=new Set();
 for(const row of rows)for(const group of row.groups)for(const id of group.entryIds){const key=JSON.stringify([row.namespace,row.kind,id]);if(active.has(key))fail('An intake entry belongs to multiple active correction dates.');active.add(key);}
 return rows;
}
export function readIntakePolicies(db){
 if(!has(db))return [];
 const size=db.prepare('SELECT coalesce(sum(length(CAST(body AS BLOB))),0) AS bytes,max(length(CAST(body AS BLOB))) AS largest FROM health_intake_policies').get();
 if(size.bytes>20000000||size.largest>1048576)fail('Correction history exceeds the workspace or Android response limit.');
 const rows=db.prepare('SELECT namespace,kind,day,body FROM health_intake_policies ORDER BY namespace,kind,day').all().map(row=>{
  let value;try{value=JSON.parse(row.body);}catch{fail('Invalid intake correction history JSON.');}parse(value);
  if(value.namespace!==row.namespace||value.kind!==row.kind||value.date!==row.day)fail('Correction history storage identity does not match its contents.');
  return value;
 });
 return validateRows(rows);
}
function write(db,row){const body=JSON.stringify(parse(row));if(Buffer.byteLength(body)>1048576)fail('Correction history exceeds the Android response limit.',413);db.prepare('INSERT INTO health_intake_policies VALUES(?,?,?,?) ON CONFLICT(namespace,kind,day) DO UPDATE SET body=excluded.body').run(row.namespace,row.kind,row.date,body);}
/** Called only inside the reviewed export owner's Store.update transaction. */
export function replaceIntakePolicies(db,rows){
 initializeIntakePolicies(db);const current=new Map(readIntakePolicies(db).map(row=>[rowKey(row),row])),keys=new Set();
 for(const row of rows){parse(row);const key=rowKey(row);if(keys.has(key))fail('Duplicate correction history replacement.');keys.add(key);const previous=current.get(key);
  if(row.revision!==(previous?.revision??0)+1||previous?.memberIds.some(id=>!row.memberIds.includes(id)))fail('Correction history revision or membership cannot go backwards.',409);
  current.set(key,row);
 }
 validateRows([...current.values()]);for(const row of rows)write(db,row);readIntakePolicies(db);
}
/** Native copies outlive local restores. Retain their identities while adopting the
 * restored workspace's grouping choices. Archived namespaces grant no authority
 * to the currently selected workspace. The backup owner owns the transaction. */
export function restoreIntakePolicies(source,target){
 const incoming=readIntakePolicies(source),existing=readIntakePolicies(target),namespace=readHealthExportIdentity(target);
 const sourceRows=new Map(incoming.map(row=>[rowKey(row),row])),targetRows=new Map(existing.map(row=>[rowKey(row),row]));
 const keys=new Set([...sourceRows.keys(),...targetRows.keys()]),merged=[];
 for(const key of keys){
  const a=sourceRows.get(key),b=targetRows.get(key),base=a??b;
  const active=base.namespace===namespace;
  const chosen=active?a:(b??a);
  const revision=Math.max(a?.revision??0,b?.revision??0)+1;
  if(!Number.isSafeInteger(revision))fail('Correction history revision exhausted.');
  merged.push({...base,timeZone:chosen?.timeZone??base.timeZone,revision,groups:chosen?.groups??[],memberIds:[...new Set([...(b?.memberIds??[]),...(a?.memberIds??[])])].sort()});
 }
 validateRows(merged);initializeIntakePolicies(target);for(const row of merged)write(target,row);readIntakePolicies(target);return merged.length;
}
/** A v2 client has no deletion/reconciliation phase. It must not bypass history. */
export function assertPlainIntakePolicies(policies,state,selection,namespace){
 if(selection.kind==='hydration'&&selection.waterSource==='logged')return;
 const rangedIds=new Set(state.entries.filter(row=>row.date>=selection.from&&row.date<=selection.to).map(row=>row.id));
 const affected=policies.filter(row=>row.namespace===namespace&&row.kind===selection.kind&&((row.date>=selection.from&&row.date<=selection.to)||row.memberIds.some(id=>rangedIds.has(id))));
 if(affected.length)fail('This selection includes correction history. Use the corrected intake review and include these dates: '+affected.map(row=>row.date).join(', ')+'.',409);
}

export function assertPlainIntakeExport(db,state,selection,namespace){
 if(selection.kind==='hydration'&&selection.waterSource==='logged')return;
 return assertPlainIntakePolicies(readIntakePolicies(db),state,selection,namespace);
}
