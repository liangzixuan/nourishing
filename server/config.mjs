export function readConfig(env) {
  const endpoint=new URL(env.APPWRITE_ENDPOINT);
  const origin=new URL(env.PUBLIC_ORIGIN);
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash) throw Error('Invalid Appwrite endpoint.');
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash) throw Error('PUBLIC_ORIGIN must be an HTTPS origin.');
  if(!/^[a-zA-Z0-9][\w.-]{0,35}$/.test(env.APPWRITE_PROJECT_ID??'')) throw Error('Invalid Appwrite project.');
  return Object.freeze({endpoint:endpoint.href.replace(/\/$/,''),origin:origin.origin,project:env.APPWRITE_PROJECT_ID,database:'nourishing',profileTable:'profiles'});
}
