import {digest} from './data-codec.mjs';
import {resolvePauseLife,parsePauseLife} from './domain/pause-life.mjs';

export const pauseLifeCommandFields={'pauseLife.save':['policy']};
export function pauseLifeView(state){
 return {revision:digest(state),policy:resolvePauseLife(state.settings.pauseLife)};
}
export function preparePauseLifeCommand(state,{type,payload}){
 if(type!=='pauseLife.save')return {type,payload};
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).length!==1||!Object.hasOwn(payload,'policy'))throw Object.assign(Error('Choose a Pause Life setting.'),{status:400});
 return {type:'settings.save',payload:{pauseLife:parsePauseLife(payload.policy)}};
}
