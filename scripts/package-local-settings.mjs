import {fileURLToPath} from 'node:url';
import {rolldown} from 'rolldown';
export async function buildLocalSettings(){
 const bundle=await rolldown({input:fileURLToPath(new URL('../server/domain/diary-group-rename.mjs',import.meta.url)),platform:'browser',onLog(level,log,handler){if(log.code==='UNRESOLVED_IMPORT')throw Error(log.message);handler(level,log);}});
 try{await bundle.write({file:fileURLToPath(new URL('../public/local-group-rename.js',import.meta.url)),format:'es',minify:true});}finally{await bundle.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await buildLocalSettings();
