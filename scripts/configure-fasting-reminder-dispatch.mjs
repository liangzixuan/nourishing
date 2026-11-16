import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Functions,ID} from 'node-appwrite';
import {InputFile} from 'node-appwrite/file';
import {operator} from './operator.mjs';

// Preserve the existing active worker while its replacement builds.
try{
 const functions=new Functions(operator().client),stage=JSON.parse(readFileSync('.local/scheduler-stage.json','utf8')),functionId='nourishing-scheduler';
 if(stage.functionId!==functionId)throw Error('Wrong staged function.');
 const current=await functions.get({functionId});
 writeFileSync('.local/fasting-reminder-worker-before.json',JSON.stringify({functionId,deploymentId:current.deploymentId,enabled:current.enabled,interval:current.interval,execute:current.execute,events:current.events},null,2));
 const variables=(await functions.listVariables({functionId})).variables;
 for(const key of ['SCHEDULER_ENABLED','REMINDERS_ENABLED']){
  const previous=variables.find(row=>row.key===key);await functions[previous?'updateVariable':'createVariable']({functionId,variableId:previous?.$id??ID.unique(),key,value:'true',secret:previous?.secret??false});
 }
 await functions.update({functionId,name:current.name,runtime:stage.runtime,entrypoint:stage.entrypoint,commands:stage.commands,timeout:stage.timeout,execute:[],events:[],scopes:stage.scopes,enabled:current.enabled,interval:current.interval});
 const archive=resolve('.local/fasting-reminder-worker.tar.gz');execFileSync('tar',['-czf',archive,'-C',stage.destination,'.'],{stdio:'pipe'});
 const deployment=await functions.createDeployment({functionId,code:InputFile.fromPath(archive),activate:false,entrypoint:stage.entrypoint,commands:stage.commands});
 const report={functionId,deploymentId:deployment.$id,status:deployment.status,activated:false};writeFileSync('.local/fasting-reminder-worker-deployment.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){console.error(JSON.stringify({error:'Fasting reminder dispatch deployment failed',code:error.code??null,type:error.type??null}));process.exitCode=1;}
