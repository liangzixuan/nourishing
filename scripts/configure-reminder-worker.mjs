import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Functions,ID} from 'node-appwrite';
import {InputFile} from 'node-appwrite/file';
import {operator} from './operator.mjs';
import {parseVapid} from '../server/web-push.mjs';

// The caller decrypts DPAPI into this child-only environment value. Never print it.
try{
 const origin=process.env.NOURISHING_REMINDERS_ORIGIN,pair=JSON.parse(process.env.NOURISHING_REMINDERS_VAPID_JSON||'null');
 delete process.env.NOURISHING_REMINDERS_VAPID_JSON;parseVapid(pair,origin);
 const stage=JSON.parse(readFileSync(new URL('../.local/reminders-stage.json',import.meta.url),'utf8')),functions=new Functions(operator().client),functionId=stage.functionId;
 const metadata={functionId,name:'Nourishing reminders',runtime:stage.runtime,entrypoint:stage.entrypoint,commands:stage.commands,timeout:stage.timeout,execute:[],events:[],scopes:stage.scopes,enabled:false,interval:0,logging:true,buildSpecification:'s-2vcpu-2gb',runtimeSpecification:'s-0.5vcpu-512mb'};
 let existing;try{existing=await functions.get({functionId});}catch(error){if(error.code!==404)throw error;}
 if(existing){writeFileSync('.local/reminders-function-before.json',JSON.stringify({functionId,deploymentId:existing.deploymentId,enabled:existing.enabled,interval:existing.interval,execute:existing.execute,events:existing.events},null,2));await functions.update(metadata);}else await functions.create(metadata);
 const variables=(await functions.listVariables({functionId})).variables;
 for(const [key,value,secret] of [['PUBLIC_ORIGIN',origin,false],['WEB_PUSH_PUBLIC_KEY',pair.publicKey,false],['WEB_PUSH_PRIVATE_KEY',pair.privateKey,true],['REMINDERS_ENABLED','true',false]]){
  const previous=variables.find(row=>row.key===key),input={functionId,variableId:previous?.$id??ID.unique(),key,value,secret:secret||previous?.secret||false};await functions[previous?'updateVariable':'createVariable'](input);
 }
 const archive=resolve('.local/reminders-worker.tar.gz');execFileSync('tar',['-czf',archive,'-C',stage.destination,'.'],{stdio:'pipe'});
 const deployment=await functions.createDeployment({functionId,code:InputFile.fromPath(archive),activate:true,entrypoint:stage.entrypoint,commands:stage.commands});
 const report={functionId,deploymentId:deployment.$id,status:deployment.status,origin,interval:0,execute:[],events:[]};writeFileSync('.local/reminders-deployment.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){console.error(JSON.stringify({error:'Reminder worker configuration or upload failed',code:error.code??null,type:error.type??null}));process.exitCode=1;}
