export const defaultPauseLife=Object.freeze({version:1,enabled:false,program:'galveston'});
export function parsePauseLife(value){
 if(value===null||value===undefined)return null;
 if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==3||!['version','enabled','program'].every(key=>Object.hasOwn(value,key))||value.version!==1||typeof value.enabled!=='boolean'||!['galveston','bfb-ps'].includes(value.program))throw Object.assign(Error('Choose a Pause Life visibility setting and program.'),{status:400});
 return {version:1,enabled:value.enabled,program:value.program};
}
