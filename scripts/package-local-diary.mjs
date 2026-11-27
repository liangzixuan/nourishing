import {fileURLToPath} from 'node:url';
import {rolldown} from 'rolldown';
const browserNodeShims={
 name:'browser-node-shims',
 resolveId(source){if(source==='node:crypto'||source==='node:util')return '\0'+source;},
 load(id){
  if(id==='\0node:crypto')return 'export const randomUUID=()=>globalThis.crypto.randomUUID();';
  if(id==='\0node:util')return 'export function isDeepStrictEqual(a,b){return JSON.stringify(a)===JSON.stringify(b);}';
 },
};
export async function buildLocalDiary(){
 const bundle=await rolldown({input:fileURLToPath(new URL('../server/local-diary-projection.mjs',import.meta.url)),platform:'browser',plugins:[browserNodeShims],onLog(level,log,handler){if(log.code==='UNRESOLVED_IMPORT')throw Error(log.message);handler(level,log);}});
 try{await bundle.write({file:fileURLToPath(new URL('../public/local-diary-projection.js',import.meta.url)),format:'es',minify:true});}finally{await bundle.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await buildLocalDiary();
