const fail=(code,message)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
/** Credentials go only to Appwrite; this confirmation does not retain a session or password. */
export async function confirmAccountPassword({account,password,budget,auth,users}){
 if(typeof password!=='string'||password.length<8||password.length>256)fail(400,'Enter your current password.');
 if(!account?.$id||!account.email)fail(401,'Sign in before deleting your account.');
 await budget(account.email);
 const session=await auth.createEmailPasswordSession({email:account.email,password,duration:60});
 try{if(session.userId!==account.$id)fail(403,'The account could not be confirmed.');}
 finally{await users.deleteSession({userId:session.userId,sessionId:session.$id});}
}
