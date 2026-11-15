// Operator setup: receives decrypted configuration through the child environment only.
import {readFileSync} from 'node:fs';
import {Client,Sites} from 'node-appwrite';
import {parseVapid} from '../server/web-push.mjs';

try{
 const config=JSON.parse(readFileSync('appwrite.config.json','utf8'));
 const temporary=JSON.parse(readFileSync('.local/pwa-site-key.json','utf8').replace(/^\uFEFF/,''));
 const vapid=JSON.parse(process.env.NOURISHING_VAPID_CONFIG??'null');
 parseVapid(vapid,'https://nourishing-cloud.appwrite.network');
 const sites=new Sites(new Client().setEndpoint(config.endpoint).setProject(config.projectId).setKey(temporary.secret)),siteId='nourishing-cloud';
 const existing=await sites.listVariables({siteId});
 const publicVariable=existing.variables.find(v=>v.key==='WEB_PUSH_PUBLIC_KEY'),privateVariable=existing.variables.find(v=>v.key==='WEB_PUSH_PRIVATE_KEY');
 if(publicVariable&&publicVariable.value!==vapid.publicKey||privateVariable&&!publicVariable)throw Error('Existing notification keys require explicit reconciliation.');
 if(!publicVariable)await sites.createVariable({siteId,variableId:'web-push-public',key:'WEB_PUSH_PUBLIC_KEY',value:vapid.publicKey,secret:false});
 if(!privateVariable)await sites.createVariable({siteId,variableId:'web-push-private',key:'WEB_PUSH_PRIVATE_KEY',value:vapid.privateKey,secret:true});
 console.log(JSON.stringify({configured:true,rotated:false,privateKeySecret:true}));
}catch(error){console.error(JSON.stringify({configured:false,code:error.code??null,error:'Notification key setup could not complete. Existing keys were not rotated.'}));process.exitCode=1;}
