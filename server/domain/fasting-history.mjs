import {sha256Hex} from './content-digest.mjs';
import {parseFastRecord,applyFastAction,compareFastInstants,fastDurationNanoseconds} from './fasting-records.mjs';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const digest=value=>sha256Hex(JSON.stringify(value));
function fields(value,required,optional=[]){if(!value||typeof value!=='object'||Array.isArray(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>![...required,...optional].includes(key)))fail('Supply the required fasting history fields only.');}
function id(value){if(typeof value!=='string'||!value.trim()||value.length>100)fail('Choose a valid fast ID.');return value;}
function hash(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail('Reload the fasting history before reviewing changes.');return value;}
function row(state,value){const selected=state.fasts.find(record=>record.id===id(value));if(!selected)fail('This fast no longer exists. Reload the history.',404);return parseFastRecord(selected);}
const capture=record=>({record,revision:digest(record)});

export function createFastingHistory({store,clock=()=>new Date()}){
  if(typeof clock!=='function')throw Error('Fasting history clock must be a function.');
  const now=()=>{const value=clock();if(!(value instanceof Date)||!Number.isFinite(value.valueOf()))fail('The fasting clock is unavailable.',503);return value;};
  function prepare(state,input,at){
    fields(input,['id','revision','changes']);hash(input.revision);fields(input.changes,['start','end','goalHours','note'],['label','repeat']);
    const before=row(state,input.id);if(digest(before)!==input.revision)fail('This fast changed after you opened it. Reload and review again.',409);
    const candidate={...state,fasts:state.fasts.map(record=>({...record}))};
    applyFastAction(candidate,'fast.update',{id:before.id,...input.changes},at);
    return {before,after:row(candidate,before.id),revision:input.revision};
  }
  function selected(state,input){
    fields(input,['ids']);if(!Array.isArray(input.ids)||input.ids.length<1||input.ids.length>100)fail('Select from 1 through 100 fasts.');
    const ids=input.ids.map(id);if(new Set(ids).size!==ids.length)fail('Select each fast once.');
    const records=ids.map(value=>row(state,value)).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    return {records,fingerprint:digest(records),activeCount:records.filter(record=>record.end===null).length};
  }
  return {
    list({offset=0,limit=25,revision}={}){
      if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)fail('Choose a valid history page of 1 through 100 records.');
      const at=now(),rows=store.read().fasts.map(parseFastRecord).sort((a,b)=>compareFastInstants(b.start,a.start)||(a.id<b.id?-1:a.id>b.id?1:0));
      const collectionRevision=digest(rows);
      if(revision!==undefined&&hash(revision)!==collectionRevision)fail('Fasting history changed. Reload before loading more.',409);
      let completedCount=0,total=0n,longest=0n,lastSevenTotal=0n;const page=[];
      for(const [index,record]of rows.entries()){
        const duration=fastDurationNanoseconds(record);
        if(duration!==null){completedCount++;total+=duration;if(completedCount<=7)lastSevenTotal+=duration;if(duration>longest)longest=duration;}
        if(index>=offset&&index<offset+limit)page.push({...record,revision:digest(record),durationSeconds:duration===null?null:Number(duration)/1e9});
      }
      const totalSeconds=Number(total)/1e9,summary={completedCount,totalSeconds,lastSevenAverageSeconds:completedCount?Number(lastSevenTotal)/1e9/Math.min(completedCount,7):null,longestSeconds:completedCount?Number(longest)/1e9:null};
      return {now:at.toISOString(),revision:collectionRevision,offset,limit,total:rows.length,summary,rows:page};
    },
    record(value){return {now:now().toISOString(),...capture(row(store.read(),value))};},
    preview(input){return prepare(store.read(),input,now());},
    save(input){
      fields(input,['id','revision','changes','confirmed']);if(input.confirmed!==true)fail('Confirm the reviewed fasting changes.');
      const at=now();let result;
      store.update(state=>{const preview=prepare(state,{id:input.id,revision:input.revision,changes:input.changes},at);applyFastAction(state,'fast.update',{id:preview.before.id,...input.changes},at);result=capture(row(state,input.id));});
      return result;
    },
    deletePreview(input){return selected(store.read(),input);},
    delete(input){
      fields(input,['ids','fingerprint','confirmed']);hash(input.fingerprint);if(input.confirmed!==true)fail('Confirm deletion of the selected fasts.');
      let result;
      store.update(state=>{const preview=selected(state,{ids:input.ids});if(preview.fingerprint!==input.fingerprint)fail('Selected fasts changed. Review deletion again.',409);const deletedIds=preview.records.map(record=>record.id),ids=new Set(deletedIds),recoverySnapshotId=store.backup();state.fasts=state.fasts.filter(record=>!ids.has(record.id));result={deletedIds,recoverySnapshotId};});
      return result;
    }
  };
}
