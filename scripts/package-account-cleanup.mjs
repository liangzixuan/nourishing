import {mkdirSync,copyFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const destination=resolve('.local/deploy-account-cleanup-'+Date.now());
mkdirSync(destination+'/server',{recursive:true});
for(const name of ['account-cleanup-entry.mjs','account-cleanup-worker.mjs','diary-range-removal-jobs.mjs','data-codec.mjs','expired-backup-reviews.mjs','expired-reminder-receipts.mjs','reminder-receipt-retention.mjs','account-operation-context.mjs','account-deletion.mjs','account-lifecycle.mjs','sentry.mjs'])copyFileSync('server/'+name,destination+'/server/'+name);
for(const name of ['package.json','package-lock.json'])copyFileSync('functions/account-cleanup/'+name,destination+'/'+name);
// Resolve the packaged entry before making this stage available for deployment.
await import(pathToFileURL(destination+'/server/account-cleanup-entry.mjs'));
writeFileSync('.local/account-cleanup-stage.json',JSON.stringify({destination}));
console.log(destination);
