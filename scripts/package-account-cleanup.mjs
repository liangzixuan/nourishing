import {mkdirSync,copyFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const destination=resolve('.local/deploy-account-cleanup-'+Date.now());
mkdirSync(destination+'/server',{recursive:true});
for(const name of ['account-cleanup-entry.mjs','account-cleanup-worker.mjs','expired-backup-reviews.mjs','account-deletion.mjs','account-lifecycle.mjs'])copyFileSync('server/'+name,destination+'/server/'+name);
for(const name of ['package.json','package-lock.json'])copyFileSync('functions/account-cleanup/'+name,destination+'/'+name);
writeFileSync('.local/account-cleanup-stage.json',JSON.stringify({destination}));
console.log(destination);
