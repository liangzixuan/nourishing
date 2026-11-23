import {diaryCycleDays} from './health-controls.mjs';
import {projectLocalDiary} from './local-diary-projection.mjs';
import {Query} from 'node-appwrite';
import {rowId,unpackWorkspace,searchTerms,digest} from './data-codec.mjs';
import {workspaceRows} from './workspace-generations.mjs';
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
 let activeCatalogHead=null;
 async function catalogHead(){if(!activeCatalogHead){activeCatalogHead=get('catalog_heads','active').catch(error=>{activeCatalogHead=null;if(error.code===404)throw Object.assign(Error('Food catalog is being prepared.'),{code:503,publicMessage:'Food catalog is being prepared.'});throw error;});}return activeCatalogHead;}
 const diaryFromState=(state,date,clock)=>projectLocalDiary(state,date,{date,cycleDays:diaryCycleDays(state,date,clock),revision:digest(state)},clock);
 return {
   readState,
   diaryFromState,
   async diary(date,clock){return diaryFromState(await readState(),date,clock);},
   async catalogStatus(){const h=await catalogHead(),metadata=JSON.parse(h.metadata);return {available:true,count:h.count,datasets:metadata.datasets};},
   async search({query='',offset=0,limit=25}){
     const h=await catalogHead(),terms=searchTerms(query);if(query.trim()&&!terms.length)return {items:[],total:0,offset,nextOffset:null};
     // Appwrite caps count estimates. Fetch one extra row so pagination does not stop at that cap.
     const result=await db.listRows({databaseId,tableId:'catalog_foods',queries:[Query.equal('generation',h.generation),...terms.map(term=>Query.contains('searchText',' '+term)),Query.select(['compact']),Query.orderAsc('priority'),Query.orderAsc('name'),Query.orderAsc('$id'),Query.limit(limit+1),Query.offset(offset)],total:false});
     const items=result.rows.slice(0,limit).map(row=>JSON.parse(row.compact));
     return {items,total:terms.length?null:h.count,offset,nextOffset:result.rows.length>limit?offset+limit:null};
   },
   async catalogFoodDetails(ids){
     const h=await catalogHead(),wanted=new Set(ids);
     const result=await db.listRows({databaseId,tableId:'catalog_foods',queries:[
       Query.equal('$id',ids.map(id=>rowId(h.generation,id))),
       Query.select(['generation','sourceId','payload']),Query.limit(ids.length)
     ],total:false});
     // Leave room for the response envelope in the device's 2 MiB cache entry.
     // A skipped resource still opens with the existing single-item read.
     const foods=[];let remaining=1024*1024;
     for(const row of result.rows){
       if(row.generation!==h.generation||!wanted.delete(row.sourceId))notFound();
       const bytes=Buffer.byteLength(row.payload);
       if(bytes>remaining)continue;
       const food=JSON.parse(row.payload);if(food.id!==row.sourceId)notFound();
       remaining-=bytes;foods.push(food);
     }
     return {generation:h.generation,foods};
   },
   async food(id){const h=await catalogHead(),row=await get('catalog_foods',rowId(h.generation,id));if(row.generation!==h.generation||row.sourceId!==id)notFound();return {food:JSON.parse(row.payload),original:JSON.parse(row.original)};},
   async media(namespace,id){const h=await head(),row=await get('workspace_media',rowId(ownerId,h.generation,namespace,id));if(row.ownerId!==ownerId||row.generation!==h.generation||row.namespace!==namespace||row.sourceId!==id)notFound();return row.fileId;}
 };
}
