import {act} from './domain/workspace.mjs';
import {digest} from './data-codec.mjs';
import {prepareProfileSettingsCommand,prepareProfileMeasurement} from './domain/profile-settings-command.mjs';
import {projectProfileSettings} from './profile-settings-view.mjs';
export {profileSettingsCommandFields,prepareProfileSettingsCommand} from './domain/profile-settings-command.mjs';

export function profileSettingsView(state,date){return projectProfileSettings(state,date,digest(state));}

/** Profile record and selected series commit together under the workspace receipt. */
export function applyProfileSettingsCommand(state,action){
 if(action.type!=='profileSettings.measurement'){const prepared=prepareProfileSettingsCommand(state,action);return act(state,prepared.type,prepared.payload);}
 const {record,bodyComposition}=prepareProfileMeasurement(state,action.payload);
 const candidate=structuredClone(state);act(candidate,'biometric.add',record);act(candidate,'settings.save',{bodyComposition});
 state.biometrics=candidate.biometrics;state.settings=candidate.settings;
 return {kind:'biometric',id:state.biometrics.at(-1).id};
}
