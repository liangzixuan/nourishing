import pinned from './data/exercise-compendium-2024.json' with {type:'json'};
import {createExerciseSearch} from './exercise-search.mjs';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const sourceAssert=(condition,message)=>{if(!condition)fail('Invalid exercise catalogue: '+message,500)};
const nonempty=value=>typeof value==='string'&&value.trim().length>0;

/** Own the parsed source records. Consumers never reinterpret the captured HTML. */
export function createExerciseCatalog(data=pinned){
 sourceAssert(data?.version===1&&nonempty(data.edition)&&nonempty(data.source),'metadata');
 sourceAssert(data.ageRange?.minimum===19&&data.ageRange?.maximum===59,'adult age scope');
 sourceAssert(Array.isArray(data.headings)&&Array.isArray(data.activities),'tables');
 const headings=new Map(),records=new Map();
 for(const heading of data.headings){
  sourceAssert(/^\d{2}$/.test(heading.id)&&!headings.has(heading.id)&&nonempty(heading.name),'heading');
  sourceAssert(typeof heading.url==='string'&&heading.url.startsWith('https://pacompendium.com/'),'heading source');
  headings.set(heading.id,Object.freeze({...heading}));
 }
 for(const row of data.activities){
  sourceAssert(typeof row.code==='string'&&/^\d{5}$/.test(row.code)&&!records.has(row.code),'activity code');
  sourceAssert(headings.has(row.heading)&&row.heading===row.code.slice(0,2),'activity heading');
  sourceAssert(Number.isFinite(row.met)&&row.met>0&&nonempty(row.description),'activity fields');
  const record=Object.freeze({code:row.code,met:row.met,description:row.description,heading:row.heading,source:headings.get(row.heading).url});
  records.set(record.code,record);
 }
 sourceAssert(records.size>0&&[...headings.keys()].every(id=>[...records.values()].some(r=>r.heading===id)),'empty heading');
 const conflicts=data.sourceAudit?.conflicts??[];
 for(const conflict of conflicts){
  const row=records.get(conflict.code);sourceAssert(row&&conflict.field==='met'&&conflict.resolution===null&&row.met===conflict.web&&Number.isFinite(conflict.pdf)&&conflict.pdf>0,'source conflict');
  records.set(row.code,Object.freeze({...row,conflict:Object.freeze({field:'met',web:row.met,pdf:conflict.pdf,pdfSource:data.sourceAudit.pdf.url,resolution:null})}));
 }
 const metadata=Object.freeze({version:1,edition:data.edition,source:data.source,terms:data.terms,citation:data.citation,ageRange:Object.freeze({...data.ageRange}),headings:Object.freeze([...headings.values()]),sourceAudit:data.sourceAudit?Object.freeze({publicationReportedActivities:data.sourceAudit.publicationReportedActivities,currentWebActivities:data.sourceAudit.currentWebActivities,pdfActivities:data.sourceAudit.pdf.activities,unresolvedConflicts:conflicts.length}):null});
 const search=createExerciseSearch([...records.values()],[...headings.values()]);
 return Object.freeze({
  metadata,
  get(code){if(typeof code!=='string'||!/^\d{5}$/.test(code))fail('Choose a five-digit exercise code.');const record=records.get(code);if(!record)fail('Exercise code was not found.',404);return record},
  search({q='',heading=null}={}){
   const items=search(q,heading);
   return {...metadata,total:items.length,items};
  }
 });
}
export const exerciseCatalog=createExerciseCatalog();
