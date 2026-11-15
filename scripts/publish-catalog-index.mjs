// Publish a derived index of the already imported public catalog. Never reads health data.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {writeFileSync} from 'node:fs';
import {Permission,Role} from 'node-appwrite';
import {InputFile} from 'node-appwrite/file';
import {operator,databaseId} from './operator.mjs';
import {foodSourceFacts,catalogSourceId} from '../server/domain/food-catalog-identity.mjs';
import {contentDigest} from '../server/domain/content-digest.mjs';
import {compactFoodSource} from '../server/domain/catalog-source.mjs';
import {catalogRow,digest} from '../server/data-codec.mjs';
import {decodeCatalogIndex,encodeCatalogIndex} from '../server/catalog-index.mjs';
const path=process.argv[2];if(!path)throw Error('Provide the imported source catalog path.');
const {db,storage}=operator(),head=await db.getRow({databaseId,tableId:'catalog_heads',rowId:'active'}),source=new DatabaseSync(path,{readOnly:true});
try{
 source.exec('BEGIN');const metadata=JSON.parse(source.prepare("SELECT body FROM metadata WHERE key='catalog'").get().body);
 if(digest(metadata).slice(0,36)!==head.generation)throw Error('Catalog generation differs from cloud.');
 const foods=[],sourceFactDigests={},catalogHash=createHash('sha256');
 for(const input of source.prepare('SELECT id,name,search_text,priority,body,original,compact FROM foods ORDER BY id').iterate()){
  const row=catalogRow(input,head.generation);catalogHash.update(JSON.stringify([row.$id,row.digest])+'\n');
  const food=JSON.parse(input.body);sourceFactDigests[catalogSourceId(food)]=contentDigest(foodSourceFacts(food));
  const projected=Object.fromEntries(['id','name','serving','grams','milliliters','nutrients','portions','category','translations','servingTranslations','sample','carbohydrateBasis'].filter(key=>food[key]!==undefined).map(key=>[key,food[key]]));
  projected.source=compactFoodSource(food.source);foods.push(projected);
 }
 if(foods.length!==head.count||catalogHash.digest('hex')!==head.digest)throw Error('Source catalog does not match verified cloud catalog.');
 const expanded=encodeCatalogIndex({generation:head.generation,catalogDigest:head.digest,foods,sourceFactDigests}),bytes=gzipSync(expanded),sha256=createHash('sha256').update(bytes).digest('hex');
 const ref={version:2,bucketId:'catalog-index',fileId:sha256.slice(0,36),sha256,bytes:bytes.length,expandedBytes:expanded.length};
 const next={...head,metadata:JSON.stringify({...JSON.parse(head.metadata),insightIndex:ref})};decodeCatalogIndex(bytes,next);
 try{await storage.getBucket({bucketId:ref.bucketId});}catch(error){if(error.code!==404)throw error;await storage.createBucket({bucketId:ref.bucketId,name:'Verified shared food indexes',permissions:[],fileSecurity:true,maximumFileSize:32*1024*1024,allowedFileExtensions:['gz'],encryption:true,antivirus:true});}
 try{await storage.getFile({bucketId:ref.bucketId,fileId:ref.fileId});}catch(error){if(error.code!==404)throw error;await storage.createFile({bucketId:ref.bucketId,fileId:ref.fileId,file:InputFile.fromBuffer(bytes,'catalog-'+head.generation+'.json.gz'),permissions:[Permission.read(Role.users())]});}
 decodeCatalogIndex(Buffer.from(await storage.getFileDownload({bucketId:ref.bucketId,fileId:ref.fileId})),next);
 writeFileSync('.local/catalog-head-before-index-'+Date.now()+'.json',JSON.stringify(head),{flag:'wx'});
 const latest=await db.getRow({databaseId,tableId:'catalog_heads',rowId:'active'});if(latest.digest!==head.digest||latest.metadata!==head.metadata)throw Error('Catalog head changed during index publication.');
 await db.updateRow({databaseId,tableId:'catalog_heads',rowId:'active',data:{metadata:next.metadata}});
 const report={count:foods.length,bytes:bytes.length,expandedBytes:expanded.length,readBackVerified:true};writeFileSync('.local/catalog-index-publication.json',JSON.stringify(report));console.log(JSON.stringify(report));
}finally{source.close();}
