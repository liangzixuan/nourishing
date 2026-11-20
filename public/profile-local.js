import {projectProfileSettings,applyProfileSettingsProjection} from './local-diary-projection.js';

export function projectProfileEdit(data,action,state){
 if(!state)throw Error('Profile data is still loading. Please try again.');
 const candidate=structuredClone(state);
 applyProfileSettingsProjection(candidate,action,action.requestId??'profile-preview');
 return projectProfileSettings(candidate,data.date,data.revision);
}
