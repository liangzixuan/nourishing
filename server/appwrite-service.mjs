import {entryAdjustmentView,previewEntryAdjustment} from './entry-adjustments.mjs';
import {dashboardView} from './dashboard-view.mjs';
import {cloudHomeWidgetView} from './home-widget-view.mjs';
import {libraryToolsView} from './library-tools.mjs';
import {createBackupStore} from './backup-store.mjs';
import {profileSettingsView} from './profile-settings.mjs';
import {snapshotsView,prepareSnapshot,SNAPSHOT_MEDIA_NAMESPACE} from './snapshots.mjs';
import {importRecipeUrl,previewRecipeImport,prepareRecipeImportSave} from './recipe-import.mjs';
import {fastingView} from './fasting.mjs';
import {previewHealthConnect} from './health-connect.mjs';
import {createHealthExport} from './health-export.mjs';
import {previewHealthReconciliation,healthReconciliationReceipt} from './health-reconciliation.mjs';
import {rowId} from './data-codec.mjs';
import {createCloudPhotoAnalyzer} from './cloud-photo.mjs';
import {validateStoredPhoto} from './domain/photo-images.mjs';
import {stagePhotoMedia} from './photo-storage.mjs';
import {loadCatalogIndex} from './catalog-index.mjs';
import {foodInsightOptions,foodOracle,foodSuggestions,previewFoodSuggestion,resolveFoodInsightIngredient} from './food-insights.mjs';
import {Client,Account,TablesDB,Storage,ID,Permission,Role,Query} from 'node-appwrite';
import {createHash} from 'node:crypto';
import {createDataRepository} from './data-repository.mjs';
import {createWorkspaceStore} from './workspace-store.mjs';
import {previewDiaryItem,captureCatalogFood} from './domain/workspace.mjs';
import {validateAction,validateLibraryPreview,previewLibrary,readActionFoods,captureActionFoods} from './workspace-commands.mjs';
import {libraryView,libraryItem} from './library-view.mjs';
import {targetView,reportView} from './nutrition-views.mjs';
import {chartView,csvReport} from './chart-view.mjs';
import {repeatView} from './repeat-view.mjs';
import {recordOptions,recordView,exerciseSearch,exerciseEstimateView} from './record-views.mjs';
import {targetPolicyView} from './target-policy-view.mjs';
import {captureCalendar} from './domain/calendar.mjs';

export function createAppwriteService(config, key, userAgent='') {
  const client=()=>new Client().setEndpoint(config.endpoint).setProject(config.project).setForwardedUserAgent(userAgent);
  const anonymous=()=>new Account(client());
  const elevated=()=>{if(!key)throw Object.assign(Error('Cloud credentials unavailable.'),{code:503});return client().setKey(key);};
  const session=secret=>{if(!secret)throw Object.assign(Error('Sign in.'),{code:401});return client().setSession(secret);};
  const profileArgs=id=>({databaseId:config.database,tableId:config.profileTable,rowId:id});
  const profileData=row=>({timeZone:row.timeZone,units:row.units});
  async function data(secret){const client=session(secret),account=await new Account(client).get();return {owner:account.$id,repository:createDataRepository(new TablesDB(client),account.$id),storage:new Storage(client)};}
  const catalogReader=repository=>async id=>{try{return (await repository.food(id)).food;}catch(error){if(error.code===404)return null;throw error;}};
  async function readView(secret,project){const {owner,repository}=await data(secret);await createWorkspaceStore(new TablesDB(elevated()),owner).create();try{return await project(await repository.readState());}catch(error){if([400,404,409].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}}
  async function calendarContext(secret,owner){const profile=await ensureProfile(secret,{$id:owner});return captureCalendar(new Date(),profile.timeZone);}
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
  async function insights(secret,input,project){
    const {owner,repository,storage}=await data(secret);await createWorkspaceStore(new TablesDB(elevated()),owner).create();
    const [state,head]=await Promise.all([repository.readState(),new TablesDB(session(secret)).getRow({databaseId:config.database,tableId:'catalog_heads',rowId:'active'})]);
    const catalog=await loadCatalogIndex({storage,head,namespace:config.endpoint+'/'+config.project});
    try{return await project(state,catalog,input);}catch(error){if([400,404,409].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}
  }
  async function backups(secret){const {owner}=await data(secret),server=elevated();return createBackupStore({db:new TablesDB(server),storage:new Storage(server),ownerId:owner});}
  async function healthExports(secret,kind){
    if(!['biometric','intake'].includes(kind))throw Object.assign(Error('Choose a Health Connect export type.'),{code:400});
    const {owner,repository}=await data(secret);await createWorkspaceStore(new TablesDB(elevated()),owner).create();const profile=await ensureProfile(secret,{$id:owner});
    return createHealthExport({readState:()=>repository.readState(),ownerId:owner,reviewSecret:process.env.PHOTO_REVIEW_SECRET,timeZone:profile.timeZone})[kind];
  }
  return {
    async healthExportOptions(secret,kind){return (await healthExports(secret,kind)).options();},
    async healthExportPreview(secret,kind,input){return (await healthExports(secret,kind)).preview(input);},
    async healthExportVerify(secret,kind,input){return (await healthExports(secret,kind)).verify(input);},
    async previewHealthReconciliation(secret,input){const {owner}=await data(secret);return readView(secret,state=>previewHealthReconciliation(state,input,{ownerId:owner,reviewSecret:process.env.PHOTO_REVIEW_SECRET}));},
    async healthReconciliationReceipt(secret,input){return readView(secret,state=>healthReconciliationReceipt(state,input));},
    async applyHealthReconciliation(secret,input){const {owner}=await data(secret),server=elevated(),store=createWorkspaceStore(new TablesDB(server),owner);await store.create();return store.reconcileHealth(input,{reviewSecret:process.env.PHOTO_REVIEW_SECRET,storage:new Storage(server)});},
    async dashboard(secret,date){const {owner}=await data(secret),context=await calendarContext(secret,owner);return readView(secret,state=>dashboardView(state,{date},context));},
    async homeWidgets(secret,unit){const {owner,repository}=await data(secret);await createWorkspaceStore(new TablesDB(elevated()),owner).create();const [state,calendar]=await Promise.all([repository.readState(),calendarContext(secret,owner)]);return cloudHomeWidgetView(state,{accountId:owner,origin:config.origin,unit,now:new Date(calendar.asOf),timeZone:calendar.timeZone});},
    async exportBackup(secret){return (await backups(secret)).export();},
    async listRecoveries(secret){return (await backups(secret)).listRecoveries();},
    async inspectRecovery(secret,input){return (await backups(secret)).inspectRecovery(input);},
    async inspectBackup(secret,input){return (await backups(secret)).inspect(input);},
    async uploadBackupMedia(secret,input){return (await backups(secret)).upload(input);},
    async restoreBackup(secret,input){return (await backups(secret)).restore(input);},
    async profileSettings(secret,date){return readView(secret,state=>profileSettingsView(state,date));},
    async snapshots(secret){return readView(secret,snapshotsView);},
    async prepareSnapshot(secret,input){return readView(secret,state=>prepareSnapshot(state,input));},
    async saveSnapshot(secret,input){
      const allowed=['requestId','revision','photo','date','time','title','note','vitals','captureMeasurements'];
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))throw Object.assign(Error('Invalid snapshot fields.'),{code:400});
      const {owner,repository}=await data(secret),db=new TablesDB(elevated()),storage=new Storage(elevated());
      const photo=await validateStoredPhoto(input.photo),{requestId,revision,photo:ignored,...metadata}=input;
      return createWorkspaceStore(db,owner).command({requestId,revision,type:'snapshot.add',payload:{photoId:photo.id,...metadata}},catalogReader(repository),{photo,stageMedia:context=>stagePhotoMedia({db,storage,owner,photo,namespace:SNAPSHOT_MEDIA_NAMESPACE,...context})});
    },
    async importRecipe(secret,input){return insights(secret,input,importRecipeUrl);},
    async previewRecipeImport(secret,input){return insights(secret,input,previewRecipeImport);},
    async saveRecipeImport(secret,input){
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['requestId','revision','draft'].includes(k)))throw Object.assign(Error('Invalid recipe fields.'),{code:400});
      const prepared=await insights(secret,input.draft,prepareRecipeImportSave),{rows,...metadata}=prepared;
      const payload={...metadata,ingredients:rows.map(row=>({foodId:row.ref.id,...row.quantity}))};
      const {owner,repository}=await data(secret);
      return createWorkspaceStore(new TablesDB(elevated()),owner).command({requestId:input.requestId,revision:input.revision,type:'recipe.save',payload},catalogReader(repository));
    },
    async fasting(secret,input){const {owner}=await data(secret),context=await calendarContext(secret,owner);return readView(secret,state=>fastingView(state,context,input));},
    async previewHealth(secret,input){
      const {owner,repository}=await data(secret),db=new TablesDB(elevated());await createWorkspaceStore(db,owner).create();
      const {summary,review}=previewHealthConnect(await repository.readState(),input,{ownerId:owner});
      const args={databaseId:config.database,tableId:'health_reviews'};
      await db.createRow({...args,rowId:rowId(owner,review.token),data:{ownerId:owner,review:JSON.stringify(review),expiresAt:new Date(Date.now()+30*60*1000).toISOString()},permissions:[]});
      const expired=await db.listRows({...args,queries:[Query.equal('ownerId',owner),Query.lessThan('expiresAt',new Date().toISOString()),Query.limit(25)],total:false});
      for(const row of expired.rows)await db.deleteRow({...args,rowId:row.$id});
      return summary;
    },
    async importHealth(secret,input,token){
      if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw Object.assign(Error('Preview this export again.'),{code:409,publicMessage:'Preview this export again.'});
      const {owner,repository}=await data(secret),db=new TablesDB(elevated());let row;
      try{row=await db.getRow({databaseId:config.database,tableId:'health_reviews',rowId:rowId(owner,token)});}catch(error){if(error.code===404)throw Object.assign(Error('Preview this export again.'),{code:409,publicMessage:'Preview this export again.'});throw error;}
      if(row.ownerId!==owner)throw Object.assign(Error('Preview this export again.'),{code:409});
      const review=JSON.parse(row.review);
      // Receipts remain replayable after expiry. New imports require a current preview.
      const store=createWorkspaceStore(db,owner),result=await store.command({requestId:token,revision:review.revision,type:'health.import',payload:{export:input,reviewToken:token}},catalogReader(repository),{ownerId:owner,healthReview:review,beforeApply:()=>{if(Date.parse(row.expiresAt)<=Date.now())throw Object.assign(Error('Preview this export again.'),{code:409,publicMessage:'Preview this export again.'});}});
      return {counts:result.counts};
    },
    async foodInsightOptions(secret){return readView(secret,state=>foodInsightOptions(state));},
    async foodOracle(secret,input){return insights(secret,input,foodOracle);},
    async foodSuggestions(secret,input){return insights(secret,input,foodSuggestions);},
    async resolveFoodInsightIngredient(secret,input){return insights(secret,input,resolveFoodInsightIngredient);},
    async previewFoodSuggestion(secret,input){return insights(secret,input,previewFoodSuggestion);},
    async analyzePhoto(secret,input,signal){const {owner,repository}=await data(secret);await createWorkspaceStore(new TablesDB(elevated()),owner).create();const state=await repository.readState();return createCloudPhotoAnalyzer().analyze(input,{owner,foods:state.foods,signal,search:(query,{limit})=>repository.search({query,limit,offset:0})});},
    async savePhoto(secret,input){
      const allowed=['requestId','revision','photo','reviewToken','date','time','group','rows'];
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))throw Object.assign(Error('Invalid photo fields.'),{code:400,publicMessage:'Invalid photo fields.'});
      const {owner,repository}=await data(secret),db=new TablesDB(elevated()),storage=new Storage(elevated());let photo;
      try{photo=await validateStoredPhoto(input.photo);}catch(error){throw Object.assign(error,{code:400,publicMessage:'Choose a valid reviewed photo.'});}
      const {requestId,revision,reviewToken,date,time,group,rows}=input;
      return createWorkspaceStore(db,owner).command({requestId,revision,type:'photo.log',payload:{photoId:photo.id,reviewToken,date,time,group,rows}},catalogReader(repository),{owner,reviewSecret:process.env.PHOTO_REVIEW_SECRET,photo,stageMedia:context=>stagePhotoMedia({db,storage,owner,photo,...context})});
    },
    async targetPolicies(secret,date){const {owner}=await data(secret),context=await calendarContext(secret,owner);return readView(secret,state=>targetPolicyView(state,date,context));},
    async repeats(secret,date){return readView(secret,state=>repeatView(state,date));},
    async recordOptions(secret,date){return readView(secret,state=>recordOptions(state,date));},
    async recordItem(secret,input){return readView(secret,state=>recordView(state,input));},
    async exercises(secret,input){await data(secret);return exerciseSearch(input);},
    async exerciseEstimate(secret,input){return readView(secret,state=>exerciseEstimateView(state,input));},
    async charts(secret,range){return readView(secret,state=>chartView(state,range));},
    async exportReport(secret,input){return readView(secret,state=>csvReport(state,input));},
    async targets(secret,date){const {owner,repository}=await data(secret);await createWorkspaceStore(new TablesDB(elevated()),owner).create();return targetView(await repository.readState(),date);},
    async nutritionReport(secret,options){const {owner,repository}=await data(secret);await createWorkspaceStore(new TablesDB(elevated()),owner).create();const account=await new Account(session(secret)).get(),profile=await ensureProfile(secret,account);return reportView(await repository.readState(),options,{timeZone:profile.timeZone});},
    async readDiary(secret,date){const {owner,repository}=await data(secret);await createWorkspaceStore(new TablesDB(elevated()),owner).create();return repository.diary(date);},
    async workspaceCommand(secret,input){const {owner,repository}=await data(secret);return createWorkspaceStore(new TablesDB(elevated()),owner).command(input,catalogReader(repository),await calendarContext(secret,owner));},
    async entryAdjustment(secret,input){return readView(secret,state=>entryAdjustmentView(state,input));},
    async previewEntryAdjustment(secret,payload){const action={type:'entry.ingredients.adjust',payload};validateAction(action);const {repository}=await data(secret),state=await repository.readState();const prepared=captureActionFoods(state,action,await readActionFoods(action,catalogReader(repository)));try{return previewEntryAdjustment(state,prepared.payload);}catch(error){if([400,404,409].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}},
    async libraryTools(secret,input){return readView(secret,state=>libraryToolsView(state,input));},
    async library(secret){const {owner,repository}=await data(secret);await createWorkspaceStore(new TablesDB(elevated()),owner).create();return libraryView(await repository.readState());},
    async libraryItem(secret,kind,id,entryId){const {repository}=await data(secret),state=await repository.readState();const entry=entryId?state.entries.find(row=>row.id===entryId):null;if(entryId&&!entry)throw Object.assign(Error('This diary entry no longer exists.'),{code:404});const resource=state[kind+'s'].find(row=>row.id===id)??(kind==='food'?(await repository.food(id)).food:null);const viewState=kind==='food'&&!state.foods.some(row=>row.id===id)?{...state,foods:[...state.foods,resource]}:state;return libraryItem(viewState,kind,resource,entry);},
    async previewLibrary(secret,input){const action=validateLibraryPreview(input),{repository}=await data(secret),state=await repository.readState();const prepared=captureActionFoods(state,action,await readActionFoods(action,catalogReader(repository)));return previewLibrary(state,{...input,draft:prepared.payload});},
    async previewDiary(secret,payload){const {repository}=await data(secret),state=await repository.readState();validateAction({type:payload?.id?'entry.update':'entry.add',payload});const p={...payload};try{if(p.foodId&&!state.foods.some(row=>row.id===p.foodId))p.foodId=captureCatalogFood(state,(await repository.food(p.foodId)).food).id;return previewDiaryItem(state,p);}catch(error){if([400,409].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}},
    async catalogStatus(secret){return (await data(secret)).repository.catalogStatus();},
    async searchCatalog(secret,input){return (await data(secret)).repository.search(input);},
    async readCatalogFood(secret,id){return (await data(secret)).repository.food(id);},
    async readMedia(secret,namespace,id){const {repository,storage}=await data(secret);if(namespace==='progress_photos'&&!((await repository.readState()).progressSnapshots??[]).some(row=>row.imageId===id))throw Object.assign(Error('Photo not found.'),{code:404});const fileId=await repository.media(namespace,id);return storage.getFileView({bucketId:'private-media',fileId});},
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
