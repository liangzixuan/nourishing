import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {Query,Permission,Role} from 'node-appwrite';
import {operator,databaseId,maybeGet} from './operator.mjs';
import {catalogRow,digest} from '../server/data-codec.mjs';
import {batches,importRows,runBatches} from './import-rows.mjs';
const file=process.argv[2];if(!file)throw Error('Provide the read-only source catalog path.');
const {db}=operator(),source=new DatabaseSync(file,{readOnly:true});
try{
 source.exec('BEGIN');
 const metadata=source.prepare("SELECT body FROM metadata WHERE key='catalog'").get().body;
 const generation=digest(JSON.parse(metadata)).slice(0,36),hash=createHash('sha256');let count=0;
 function* rows(){for(const input of source.prepare('SELECT id,name,search_text,priority,body,original,compact FROM foods ORDER BY id').iterate()){const row=catalogRow(input,generation);hash.update(JSON.stringify([row.$id,row.digest])+'\n');yield row;}}
 let lastReport=0;
 await runBatches(batches(rows()),async batch=>{await importRows(db,'catalog_foods',batch);count+=batch.length;if(count-lastReport>=1000){console.log(JSON.stringify({stage:'catalog-upload',rows:count,total:JSON.parse(metadata).foodCount}));lastReport=count;}});
 if(count!==JSON.parse(metadata).foodCount)throw Error('Catalog metadata count mismatch.');
 const sourceDigest=hash.digest('hex'),expected=new Map();
 for(const input of source.prepare('SELECT id,name,search_text,priority,body,original,compact FROM foods ORDER BY id').iterate()){const row=catalogRow(input,generation);expected.set(row.$id,row.digest);}
 let after,checked=0;
 do{const page=await db.listRows({databaseId,tableId:'catalog_foods',queries:[Query.equal('generation',generation),Query.select(['$id','digest']),Query.limit(1000),Query.orderAsc('$id'),...(after?[Query.cursorAfter(after)]:[])],total:false});for(const row of page.rows){if(expected.get(row.$id)!==row.digest)throw Error('Catalog read-back digest mismatch.');expected.delete(row.$id);checked++;}after=page.rows.length===1000?page.rows.at(-1).$id:null;}while(after);
 if(expected.size||checked!==count)throw Error('Catalog read-back coverage mismatch.');
 const data={generation,digest:sourceDigest,count,metadata},old=await maybeGet(db,'catalog_heads','active');
 if(old&&old.generation!==generation)throw Error('An active catalog already exists; explicit version cutover required.');
 if(old){if(old.digest!==sourceDigest||old.count!==count)throw Error('Active catalog differs.');}
 else await db.createRow({databaseId,tableId:'catalog_heads',rowId:'active',data,permissions:[Permission.read(Role.users())]});
 const report={at:new Date().toISOString(),generation,count,checked,digest:sourceDigest,writeResponsesCompared:true,readBackDigestsCompared:true,status:'verified',sourceMetadataRetained:true};
 writeFileSync(new URL('../.local/catalog-import.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{source.close();}
