import {fileURLToPath} from 'node:url';
import {rolldown} from 'rolldown';
export async function buildLocalDiary(){
 const bundle=await rolldown({input:fileURLToPath(new URL('../server/local-diary-projection.mjs',import.meta.url)),platform:'browser',onLog(level,log,handler){if(log.code==='UNRESOLVED_IMPORT')throw Error(log.message);handler(level,log);}});
 try{await bundle.write({file:fileURLToPath(new URL('../public/local-diary-projection.js',import.meta.url)),format:'es',minify:true});}finally{await bundle.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await buildLocalDiary();
