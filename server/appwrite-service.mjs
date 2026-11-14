import {Client,Account,TablesDB,Storage,ID,Permission,Role,Query} from 'node-appwrite';
import {createHash} from 'node:crypto';
import {createDataRepository} from './data-repository.mjs';
import {createWorkspaceStore} from './workspace-store.mjs';
import {previewDiaryItem,captureCatalogFood} from './domain/workspace.mjs';
import {validateAction} from './diary-commands.mjs';

export function createAppwriteService(config, key, userAgent='') {
  const client=()=>new Client().setEndpoint(config.endpoint).setProject(config.project).setForwardedUserAgent(userAgent);
  const anonymous=()=>new Account(client());
  const elevated=()=>{if(!key)throw Object.assign(Error('Cloud credentials unavailable.'),{code:503});return client().setKey(key);};
  const session=secret=>{if(!secret)throw Object.assign(Error('Sign in.'),{code:401});return client().setSession(secret);};
  const profileArgs=id=>({databaseId:config.database,tableId:config.profileTable,rowId:id});
  const profileData=row=>({timeZone:row.timeZone,units:row.units});
  async function data(secret){const client=session(secret),account=await new Account(client).get();return {owner:account.$id,repository:createDataRepository(new TablesDB(client),account.$id),storage:new Storage(client)};}
  async function ensureProfile(secret,account) {
    const db=new TablesDB(session(secret));const args=profileArgs(account.$id);
    try{return profileData(await db.getRow(args));}catch(error){if(error.code!==404)throw error;}
    // Only the server can create profile IDs. Browser clients cannot reserve another user's ID.
    try {await new TablesDB(elevated()).createRow({...args,data:{timeZone:'UTC',units:'metric'},permissions:[Permission.read(Role.user(account.$id)),Permission.update(Role.user(account.$id)),Permission.delete(Role.user(account.$id))]});}
    catch(error){if(error.code!==409)throw error;}
    return profileData(await db.getRow(args));
  }
  async function budget(email) {
    const db=new TablesDB(elevated()),now=Date.now(),hour=Math.floor(now/3600000);
    const rowId=createHash('sha256').update(`${hour}:${email.trim().toLowerCase()}`).digest('hex').slice(0,32);
    const args={databaseId:config.database,tableId:'login_limits',rowId};
    let row;
    try{row=await db.createRow({...args,data:{attempts:1,expiresAt:new Date((hour+2)*3600000).toISOString()},permissions:[]});}
    catch(error){if(error.code!==409)throw error;row=await db.incrementRowColumn({...args,column:'attempts',value:1});}
    if(row.attempts>20)throw Object.assign(Error('Too many sign-in attempts. Try again later.'),{code:429});
    // Bound retention without a process-local timer. Never retain email addresses in this table.
    const expired=await db.listRows({databaseId:config.database,tableId:'login_limits',queries:[Query.lessThan('expiresAt',new Date(now).toISOString()),Query.limit(25)]});
    for(const item of expired.rows)try{await db.deleteRow({...args,rowId:item.$id});}catch(error){if(error.code!==404)throw error;}
  }
  async function login({email,password}) {
    await budget(email);
    return new Account(elevated()).createEmailPasswordSession({email,password,duration:2592000});
  }
  return {
    async readDiary(secret,date){const {owner,repository}=await data(secret);await createWorkspaceStore(new TablesDB(elevated()),owner).create();return repository.diary(date);},
    async diaryCommand(secret,input){const {owner,repository}=await data(secret);return createWorkspaceStore(new TablesDB(elevated()),owner).command(input,async id=>{try{return (await repository.food(id)).food;}catch(error){if(error.code===404)return null;throw error;}});},
    async readDiaryFood(secret,id){const {repository}=await data(secret),state=await repository.readState();const food=state.foods.find(row=>row.id===id);return food?{food}:repository.food(id);},
    async previewDiary(secret,payload){const {repository}=await data(secret),state=await repository.readState();validateAction({type:payload?.id?'entry.update':'entry.add',payload});const p={...payload};try{if(p.foodId&&!state.foods.some(row=>row.id===p.foodId))p.foodId=captureCatalogFood(state,(await repository.food(p.foodId)).food).id;return previewDiaryItem(state,p);}catch(error){if([400,409].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}},
    async catalogStatus(secret){return (await data(secret)).repository.catalogStatus();},
    async searchCatalog(secret,input){return (await data(secret)).repository.search(input);},
    async readCatalogFood(secret,id){return (await data(secret)).repository.food(id);},
    async readMedia(secret,namespace,id){const {repository,storage}=await data(secret),fileId=await repository.media(namespace,id);return storage.getFileView({bucketId:'private-media',fileId});},
    login,
    async register({email,password,name}) {await anonymous().create({userId:ID.unique(),email,password,name});return login({email,password});},
    async current(secret) {const account=await new Account(session(secret)).get();return {id:account.$id,email:account.email,name:account.name,emailVerified:account.emailVerification,profile:await ensureProfile(secret,account)};},
    async updateProfile(secret,data) {const account=await new Account(session(secret)).get();await ensureProfile(secret,account);return profileData(await new TablesDB(session(secret)).updateRow({...profileArgs(account.$id),data}));},
    async logout(secret) {if(secret)await new Account(session(secret)).deleteSession({sessionId:'current'});},
    async requestRecovery({email}) {try{await anonymous().createRecovery({email,url:`${config.origin}/reset-password`});}catch(error){if(!['user_not_found','user_invalid_credentials'].includes(error.type))throw error;}},
    async resetPassword(data) {await anonymous().updateRecovery(data);},
    async requestVerification(secret) {await new Account(session(secret)).createVerification({url:`${config.origin}/verify-email`});},
    async verifyEmail(data) {await anonymous().updateVerification(data);}
  };
}
