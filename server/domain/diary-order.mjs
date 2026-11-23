import {hasDiaryGroup} from './diary-groups.mjs';
const recordedTime=row=>typeof row?.time==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.time)?row.time:null;

export function sortAllDiaryEntriesByTime(state){
  state.settings.diarySort='time';
  delete state.settings.diaryGroupOrder;
}

/** Compare recorded local times only. Equal and untimed ties keep source order. */
export function compareRecordedTime(a,b,{untimed='last'}={}){
  if(!['first','last'].includes(untimed))throw new RangeError('Untimed entries must appear first or last.');
  const left=recordedTime(a),right=recordedTime(b);
  if(left===right)return 0;
  if(left===null)return untimed==='first'?-1:1;
  if(right===null)return untimed==='first'?1:-1;
  return left<right?-1:1;
}

/** Return a display copy. The caller retains grouping and source ownership. */
export function orderDiaryEntries(rows,mode='source'){
  if(!['source','time'].includes(mode))throw new RangeError('Choose source or time diary order.');
  const result=rows.slice();
  return mode==='time'?result.sort(compareRecordedTime):result;
}

const groupOrderError=()=>{throw Object.assign(Error('Choose added order, time order or the diary default for an existing group.'),{status:400});};
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export function parseDiaryGroupOrder(value,groups){
  if(value===null)return null;
  if(!exactKeys(value,['version','groups'])||value.version!==1||!Array.isArray(value.groups))groupOrderError();
  const seen=new Set();
  return {version:1,groups:value.groups.map(row=>{
    if(!exactKeys(row,['group','mode'])||typeof row.group!=='string'||!hasDiaryGroup(groups,row.group)||seen.has(row.group)||!['source','time'].includes(row.mode))groupOrderError();
    seen.add(row.group);return {group:row.group,mode:row.mode};
  })};
}
/** Resolve once per render; a missing override inherits the global diary order. */
export function diaryGroupOrders(settings){
  const policy=settings.diaryGroupOrder===undefined?null:parseDiaryGroupOrder(settings.diaryGroupOrder,settings.groups);
  return new Map(policy?.groups.map(row=>[row.group,row.mode])??[]);
}
export function setDiaryGroupOrder(state,input){
  if(!exactKeys(input,['group','mode'])||typeof input.group!=='string'||!hasDiaryGroup(state.settings.groups,input.group)||![null,'source','time'].includes(input.mode))groupOrderError();
  const orders=diaryGroupOrders(state.settings);
  if(input.mode===null)orders.delete(input.group);else orders.set(input.group,input.mode);
  if(orders.size)state.settings.diaryGroupOrder={version:1,groups:[...orders].map(([group,mode])=>({group,mode}))};
  else delete state.settings.diaryGroupOrder;
}
