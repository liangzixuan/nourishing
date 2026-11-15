import {mkdirSync,cpSync,copyFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
// Keep the same locked server dependency graph as the web app.
const destination=resolve('.local/deploy-scheduler-'+Date.now());
mkdirSync(destination,{recursive:true});cpSync('server',destination+'/server',{recursive:true});
for(const name of ['package.json','package-lock.json'])copyFileSync(name,destination+'/'+name);
const deployment={destination,functionId:'nourishing-scheduler',runtime:'node-22',entrypoint:'server/scheduler-entry.mjs',commands:'npm ci --omit=dev',timeout:60,execute:[],scopes:['rows.read','rows.write','executions.read','executions.write'],enabled:false,interval:0};
writeFileSync('.local/scheduler-stage.json',JSON.stringify(deployment,null,2));console.log(JSON.stringify(deployment));
