const name='__Host-nourishing_deletion',flags='Path=/; HttpOnly; Secure; SameSite=Strict';
const valid=t=>t&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(t.id)&&/^[a-f0-9]{64}$/.test(t.secret);
const fail=()=>{throw Object.assign(Error('Invalid deletion receipt.'),{code:400,publicMessage:'Open account settings to continue.'});};
export function deletionCookie(ticket){if(!valid(ticket))fail();return `${name}=${ticket.id}.${ticket.secret}; ${flags}; Max-Age=604800`;}
export function readDeletionTicket(header=''){
 const matches=header.split(';').map(part=>part.trim()).filter(part=>part.startsWith(name+'='));if(matches.length>1)fail();if(!matches.length)return null;
 const value=matches[0].slice(name.length+1),split=value.lastIndexOf('.'),ticket={id:value.slice(0,split),secret:value.slice(split+1)};if(!valid(ticket))fail();return ticket;
}
