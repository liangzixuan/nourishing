const fail=(code,message)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value,min,max,message)=>{if(typeof value!=='string'||value.length<min||value.length>max)fail(400,message);return value;};
/** Account fields go directly to the current session's provider, never workspace receipts. */
export function parseAccountEdit(input){
 const fields={name:['kind','name'],email:['kind','email','password'],password:['kind','password','oldPassword']},keys=Object.hasOwn(fields,input?.kind)?fields[input.kind]:null;
 if(!object(input)||!keys||Object.keys(input).length!==keys.length||keys.some(key=>!Object.hasOwn(input,key)))fail(400,'Choose an account field and enter the required values.');
 if(input.kind==='name'){const name=text(input.name,1,128,'Enter a name of up to 128 characters.').trim();if(!name)fail(400,'Enter your name.');return {kind:'name',name};}
 if(input.kind==='email'){const email=text(input.email,3,320,'Enter a valid email address.').trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Enter a valid email address.');return {kind:'email',email,password:text(input.password,8,256,'Enter your current password.')};}
 return {kind:'password',password:text(input.password,8,256,'Use a new password between 8 and 256 characters.'),oldPassword:text(input.oldPassword,8,256,'Enter your current password.')};
}
export function accountIdentity(value){
 if(!value||typeof value.$id!=='string'||!value.$id||typeof value.name!=='string'||typeof value.email!=='string'||typeof value.emailVerification!=='boolean')fail(503,'The change could not be confirmed. Check your account.');
 return {id:value.$id,name:value.name,email:value.email,emailVerified:value.emailVerification};
}
export async function editAccount(account,input){
 const value=parseAccountEdit(input);let result;
 try{if(value.kind==='name')result=await account.updateName({name:value.name});else if(value.kind==='email')result=await account.updateEmail({email:value.email,password:value.password});else result=await account.updatePassword({password:value.password,oldPassword:value.oldPassword});}
 catch(error){const code=Number(error.code);if(code===401)fail(401,'Check your current password, or sign in again.');if(code===409)fail(409,'That email address is already in use.');if(code===429)fail(429,'Too many attempts. Try again later.');if(code===400)fail(400,value.kind==='password'?'Choose a different password and check your current password.':'Check the account details and try again.');if(code===403)fail(403,'This account change is not available.');fail(503,'The change could not be confirmed. Check your account.');}
 return {ok:true,account:accountIdentity(result)};
}
