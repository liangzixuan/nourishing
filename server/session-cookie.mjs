import {createHash} from 'node:crypto';
const name='__Host-nourishing_session';
const flags='Path=/; HttpOnly; Secure; SameSite=Strict';
export function sessionCookie({secret,expire}) {
  const expiry=new Date(expire);
  if(typeof secret!=='string'||!secret||!Number.isFinite(+expiry)||+expiry<=Date.now()) throw Error('Invalid provider session.');
  return `${name}=${encodeURIComponent(secret)}; ${flags}; Expires=${expiry.toUTCString()}`;
}
export function clearSession(){return `${name}=; ${flags}; Max-Age=0`;}
export function readSession(header='') {
  const matches=header.split(';').map(p=>p.trim()).filter(p=>p.startsWith(`${name}=`));
  if(matches.length>1)throw Object.assign(Error('Invalid session cookie.'),{code:401});
  try{return matches.length?decodeURIComponent(matches[0].slice(name.length+1)):null;}catch{throw Object.assign(Error('Invalid session cookie.'),{code:401});}
}

// A public cache binding, never accepted as an authentication credential.
export const sessionContext=secret=>secret?createHash('sha256').update('nourishing-device-context\0'+secret).digest('hex'):'';
