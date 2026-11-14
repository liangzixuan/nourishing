import {writeFileSync} from 'node:fs';
const text=(key,type='text')=>({key,type,required:true});
const varchar=(key,size)=>({key,type:'varchar',size,required:true});
const integer=key=>({key,type:'integer',required:true});
const index=(key,attributes)=>({key,type:'key',attributes});
const common=[varchar('generation',36),varchar('digest',64)];
export const tables=[
 {id:'workspace_records',name:'Private workspace records',columns:[...common,varchar('ownerId',36),varchar('family',64),text('sourceId'),integer('position'),varchar('day',10),text('payload','mediumtext')],indexes:[index('owner_generation',['ownerId','generation']),index('owner_family_day',['ownerId','generation','family','day'])]},
 {id:'workspace_heads',name:'Verified workspace imports',columns:[...common,varchar('ownerId',36),text('layout')],indexes:[]},
 {id:'workspace_media',name:'Private image metadata',columns:[varchar('ownerId',36),varchar('generation',36),varchar('namespace',32),varchar('sourceId',64),varchar('fileId',36),varchar('digest',64),integer('width'),integer('height'),integer('bytes')],indexes:[index('owner_generation',['ownerId','generation'])]},
 {id:'catalog_foods',name:'Shared food catalog',columns:[...common,text('sourceId'),varchar('name',256),text('searchText'),integer('priority'),text('payload','mediumtext'),text('original','mediumtext'),text('compact')],indexes:[index('generation_order',['generation','priority','name'])]},
 {id:'catalog_heads',name:'Verified catalog versions',columns:[varchar('generation',36),varchar('digest',64),integer('count'),text('metadata','mediumtext')],indexes:[]}
];
if(process.argv[1]?.endsWith('data-schema.mjs'))writeFileSync(new URL('../.local/data-schema.json',import.meta.url),JSON.stringify(tables,null,2));
