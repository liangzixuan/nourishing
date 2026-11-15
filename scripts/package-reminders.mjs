import {mkdirSync,cpSync,copyFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
// Preserve the same locked dependency graph as the deployed PWA.
const destination=resolve('.local/deploy-reminders-'+Date.now());
mkdirSync(destination,{recursive:true});cpSync('server',destination+'/server',{recursive:true});
for(const name of ['package.json','package-lock.json'])copyFileSync(name,destination+'/'+name);
const deployment={destination,functionId:'nourishing-reminders',runtime:'node-22',entrypoint:'server/reminder-schedules-entry.mjs',commands:'npm ci --omit=dev',timeout:60,execute:[],events:[],scopes:['rows.read','rows.write','executions.read','executions.write'],enabled:false,interval:0};
writeFileSync('.local/reminders-stage.json',JSON.stringify(deployment,null,2));console.log(JSON.stringify(deployment));
