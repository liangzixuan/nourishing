import {createHash} from 'node:crypto';
import {Permission,Role} from 'node-appwrite';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const rowId=(...parts)=>digest(parts).slice(0,36);
const invalid=()=>{throw Error('Stored workspace does not match its verified manifest.');};
export function packWorkspace(state,ownerId,generation){
 if(!state||typeof state!=='object'||Array.isArray(state)||!ownerId||!generation)throw Error('Workspace and owner identity required.');
 const rows=[],layout={};
 for(const [family,value]of Object.entries(state)){
   const array=Array.isArray(value),items=array?value:[value];layout[family]={array,count:items.length};const seen=new Set();
   for(const [position,item]of items.entries()){
     const sourceId=array&&typeof item?.id==='string'?item.id:String(position);
     if(seen.has(sourceId))throw Error(`Duplicate identity in ${family}.`);seen.add(sourceId);
     const payload=JSON.stringify(item);
     rows.push({$id:rowId(ownerId,generation,family,sourceId),$permissions:[Permission.read(Role.user(ownerId))],ownerId,generation,family,sourceId,position,day:array&&typeof item?.date==='string'?item.date:'',payload,digest:digest(item)});
   }
 }
 return {head:{ownerId,generation,layout:JSON.stringify(layout),digest:digest(state)},rows};
}
export function unpackWorkspace(head,rows){
 const layout=JSON.parse(head.layout),result={},seen=new Set();
 if(rows.length!==Object.values(layout).reduce((n,v)=>n+v.count,0))invalid();
 for(const [family,{array,count}]of Object.entries(layout)){
   const selected=rows.filter(row=>row.family===family).sort((a,b)=>a.position-b.position);
   if(selected.length!==count)invalid();
   const values=selected.map((row,index)=>{
     if(row.ownerId!==head.ownerId||row.generation!==head.generation||row.position!==index||row.$id!==rowId(head.ownerId,head.generation,family,row.sourceId)||seen.has(row.$id))invalid();seen.add(row.$id);
     const value=JSON.parse(row.payload);if(digest(value)!==row.digest)invalid();
     if(row.sourceId!==(array&&typeof value?.id==='string'?value.id:String(index)))invalid();
     if(row.day!==(array&&typeof value?.date==='string'?value.date:''))invalid();
     return value;
   });
   Object.defineProperty(result,family,{value:array?values:values[0],enumerable:true,writable:true,configurable:true});
 }
 if(digest(result)!==head.digest)invalid();return result;
}
export const searchTerms=value=>value.toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').match(/[\p{L}\p{N}]+/gu)??[];
export function catalogRow(input,generation){
 const body=JSON.parse(input.body),compact=JSON.parse(input.compact);JSON.parse(input.original);
 if(body.id!==input.id||compact.id!==input.id)throw Error('Catalog source identity mismatch.');
 return {$id:rowId(generation,input.id),$permissions:[Permission.read(Role.users())],generation,sourceId:input.id,name:input.name,searchText:' '+searchTerms(input.search_text).join(' '),priority:input.priority,payload:input.body,original:input.original,compact:input.compact,digest:digest(input)};
}
