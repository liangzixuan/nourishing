import {createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {gzip} from 'node:zlib';

const compress=promisify(gzip);
const foodsPerShard=256;

// Keep each serving, unit, measured zero and unknown exactly as published.
// A phone can decompress one small member without expanding the whole catalog.
export async function buildClientNutritionPack(index,packedSources){
 const {generation,nutrientIds,sources,foods,sourceFactDigests}=index;
 const sorted=foods.map((food,i)=>({food,source:packedSources[i]})).filter(row=>row.food.sample!==true);
 sorted.sort((a,b)=>a.food.id<b.food.id?-1:a.food.id>b.food.id?1:0);
 const shards=[],members=[];
 for(let i=0;i<sorted.length;i+=foodsPerShard){
  const rows=sorted.slice(i,i+foodsPerShard).map(({food,source})=>{
   const sourceFactDigest=sourceFactDigests[food.id];
   if(typeof sourceFactDigest!=='string'||!sourceFactDigest)throw Error('Missing published food identity.');
   return {...food,source,sourceFactDigest};
  });
  const data=Buffer.from(JSON.stringify(rows));
  const member=await compress(data);
  shards.push({first:rows[0].id,last:rows.at(-1).id,count:rows.length,bytes:member.length,
   expandedBytes:data.length,sha256:createHash('sha256').update(member).digest('hex')});
  members.push(member);
 }
 const header=Buffer.from(JSON.stringify({version:1,generation,count:sorted.length,nutrientIds,sources,shards}));
 const size=Buffer.alloc(4);size.writeUInt32BE(header.length);
 return Buffer.concat([size,header,...members]);
}
