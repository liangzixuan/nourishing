import {fileURLToPath} from 'node:url';
import {rolldown} from 'rolldown';

export async function buildLocalCharts(){
 const bundle=await rolldown({input:fileURLToPath(new URL('../server/local-chart-projection.mjs',import.meta.url)),platform:'browser',plugins:[{name:'browser-cycle-composition',resolveId(source){if(source==='./cycle-view.mjs')return fileURLToPath(new URL('../server/local-cycle-view.mjs',import.meta.url));}}],onLog(level,log,defaultHandler){if(log.code==='UNRESOLVED_IMPORT')throw Error(log.message);defaultHandler(level,log);}});
 try{await bundle.write({file:fileURLToPath(new URL('../public/local-chart-projection.js',import.meta.url)),format:'es',minify:true});}
 finally{await bundle.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await buildLocalCharts();
