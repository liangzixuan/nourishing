import {fileURLToPath} from 'node:url';
import {rolldown} from 'rolldown';

export async function buildLocalCharts(){
 const bundle=await rolldown({input:fileURLToPath(new URL('../server/local-chart-projection.mjs',import.meta.url)),platform:'browser',plugins:[{name:'browser-cycle-composition',resolveId(source){if(source==='./cycle-view.mjs')return fileURLToPath(new URL('../server/local-cycle-view.mjs',import.meta.url));if(source==='node:crypto'||source==='node:util')return '\0'+source;},load(id){if(id==='\0node:crypto')return 'export const randomUUID=()=>globalThis.crypto.randomUUID();';if(id==='\0node:util')return 'export function isDeepStrictEqual(a,b){return JSON.stringify(a)===JSON.stringify(b);}';}}],onLog(level,log,defaultHandler){if(log.code==='UNRESOLVED_IMPORT')throw Error(log.message);defaultHandler(level,log);}});
 try{await bundle.write({file:fileURLToPath(new URL('../public/local-chart-projection.js',import.meta.url)),format:'es',minify:true});}
 finally{await bundle.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await buildLocalCharts();
