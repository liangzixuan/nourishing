import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source='../cronometer-local',target='public/streak-source';
mkdirSync(target,{recursive:true});const files=[],hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function copy(from,to,transform=bytes=>bytes,transforms=[]){const input=readFileSync(source+'/'+from),output=transform(input);writeFileSync(to,output);files.push({source:from,target:to,sourceSha256:hash(input),sha256:hash(output),transforms});}
copy('public/discover-share.js',target+'/discover-share.js',bytes=>Buffer.from(bytes.toString('utf8').replace(/\r\n?/g,'\n')
 .replace("from './message-format.js'","from '../dashboard-source/message-format.js'")
 .replace("typeof globalThis.NourishingNative?.shareImage==='function'||",'')
 .replace(" if(typeof globalThis.NourishingNative?.shareImage==='function'){await globalThis.NourishingNative.shareImage(file);return 'opened';}\n",'')
 .replace(' // The Android bridge intercepts this click and opens its existing save-file picker.\n','')),
 ['Normalize LF','Reuse Dashboard message formatter','Remove native Android bridge paths']);
copy('public/discover-assets/fonts.css',target+'/fonts.css',bytes=>Buffer.from(bytes.toString('utf8').replace(/\r\n?/g,'\n').replaceAll('/discover-assets/','/streak-source/')),['Normalize LF','Resolve bundled font URLs']);
for(const name of ['type-1.woff2','type-2.woff2','type-3.woff2','type-4.woff2','type-5.woff2','symbols.woff2'])copy('public/discover-assets/'+name,target+'/'+name);
writeFileSync('docs/streak-share-source.json',JSON.stringify({version:1,source,files},null,2)+'\n');
console.log(JSON.stringify({files:files.length}));
