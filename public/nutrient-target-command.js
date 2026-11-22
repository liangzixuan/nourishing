import {queueCommand} from './diary-api.js';
import {localWorkspaceView} from './local-engine.js';
import {projectDiaryBulkWrite} from './local-diary-projection.js';
import {formatMessage} from './targets-source/message-format.js';
import {uiLanguage} from './app-language.js';

export async function saveNutrientTarget(owner,revision,type,payload){
 const ticket=await owner;
 if(!ticket)throw Error(formatMessage(uiLanguage(),'mobileNutrientTargets.reopen'));
 const local=await localWorkspaceView();
 if(local)projectDiaryBulkWrite(structuredClone(local.state),{type,payload});
 return queueCommand(revision,type,payload,{ticket});
}
