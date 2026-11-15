import {Query} from 'node-appwrite';
import {rowId,unpackWorkspace,searchTerms,digest} from './data-codec.mjs';
import {calculateSummary,entryFacts} from './domain/nutrition.mjs';
import {workspaceRows} from './workspace-store.mjs';
const databaseId='nourishing';
const notFound=()=>{throw Object.assign(Error('No migrated data is available.'),{code:404,publicMessage:'No migrated data is available.'});};
export function createDataRepository(db,ownerId){
 const get=(tableId,id)=>db.getRow({databaseId,tableId,rowId:id});
 async function head(){try{const value=await get('workspace_heads',ownerId);if(value.ownerId!==ownerId)notFound();return value;}catch(error){if(error.code===404)notFound();throw error;}}
 async function readState(){
   for(let attempt=0;attempt<3;attempt++){
    const current=await head(),rows=await workspaceRows(db,ownerId,current.generation),latest=await head();
    if(current.digest!==latest.digest)continue;return unpackWorkspace(current,rows);
   }
   throw Object.assign(Error('The diary is being updated. Try again.'),{code:409,publicMessage:'The diary is being updated. Try again.'});
 }
 async function catalogHead(){try{return await get('catalog_heads','active');}catch(error){if(error.code===404)throw Object.assign(Error('Food catalog is being prepared.'),{code:503,publicMessage:'Food catalog is being prepared.'});throw error;}}
 return {
   readState,
   async diary(date){const state=await readState();return {date,revision:digest(state),theme:state.settings.theme??'dark',groups:state.settings.groups,completed:state.settings.completedDays?.includes(date)??false,entries:state.entries.filter(r=>r.date===date).map(row=>({...row,facts:entryFacts(state,row)})),biometrics:state.biometrics.filter(r=>r.date===date),notes:state.notes.filter(r=>r.date===date),summary:calculateSummary(state,date)};},
   async catalogStatus(){const h=await catalogHead(),metadata=JSON.parse(h.metadata);return {available:true,count:h.count,datasets:metadata.datasets};},
   async search({query='',offset=0,limit=25}){
     const h=await catalogHead(),terms=searchTerms(query);if(query.trim()&&!terms.length)return {items:[],total:0,offset,nextOffset:null};
     // Appwrite caps count estimates. Fetch one extra row so pagination does not stop at that cap.
     const result=await db.listRows({databaseId,tableId:'catalog_foods',queries:[Query.equal('generation',h.generation),...terms.map(term=>Query.contains('searchText',' '+term)),Query.select(['compact']),Query.orderAsc('priority'),Query.orderAsc('name'),Query.orderAsc('$id'),Query.limit(limit+1),Query.offset(offset)],total:false});
     const items=result.rows.slice(0,limit).map(row=>JSON.parse(row.compact));
     return {items,total:terms.length?null:h.count,offset,nextOffset:result.rows.length>limit?offset+limit:null};
   },
   async food(id){const h=await catalogHead(),row=await get('catalog_foods',rowId(h.generation,id));if(row.generation!==h.generation||row.sourceId!==id)notFound();return {food:JSON.parse(row.payload),original:JSON.parse(row.original)};},
   async media(namespace,id){const h=await head(),row=await get('workspace_media',rowId(ownerId,h.generation,namespace,id));if(row.ownerId!==ownerId||row.generation!==h.generation||row.namespace!==namespace||row.sourceId!==id)notFound();return row.fileId;}
 };
}
