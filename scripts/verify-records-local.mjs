// Run the production-CSP record editor integration; no Appwrite credentials required.
import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['--test','tests/records-browser.test.mjs'],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
