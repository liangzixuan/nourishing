import {createReminderScheduleStore} from './reminder-schedules-store.mjs';
import {createReminderDispatcher} from './reminder-schedules-dispatch.mjs';
import {createWebPushStore} from './web-push-store.mjs';
import {parseTextFoodLog} from './text-log.mjs';
import {createFastingDispatcher} from './scheduler-dispatch.mjs';
import {createCsvImportStore} from './csv-import-store.mjs';
import {favoriteView,nutritionLabelView,nutritionLabelPreview} from './library-extras.mjs';
import {createAccountLifecycle} from './account-lifecycle.mjs';
import {createAccountDeletion} from './account-deletion.mjs';
import {AccountOperationClient,withinAccountOperation} from './account-operation-context.mjs';
import {confirmAccountPassword} from './account-password.mjs';
import {prepareNotePhoto,validateNotePhotoAction,NOTE_MEDIA_NAMESPACE} from './note-photos.mjs';
import {nutrientDetail,reportNutrientDetail} from './nutrient-detail.mjs';
import {diaryToolsReview,diaryEnergy} from './diary-tools.mjs';
import {printReportOptions,previewPrintReport} from './print-report.mjs';
import {lookupBarcode,searchBranded,previewBarcode,validateBarcodeLookup,validateBrandedSearch} from './barcode.mjs';
import {takeBrandedBudget} from './provider-budget.mjs';
import {entryAdjustmentView,previewEntryAdjustment} from './entry-adjustments.mjs';
import {exportLibraryItem,previewSharedImport,previewFoodPrint} from './library-sharing.mjs';
import {coachView,coachAnswer} from './coach-view.mjs';
import {dashboardView} from './dashboard-view.mjs';
import {libraryToolsView} from './library-tools.mjs';
import {createBackupStore} from './backup-store.mjs';
import {profileSettingsView} from './profile-settings.mjs';
import {snapshotsView,prepareSnapshot,SNAPSHOT_MEDIA_NAMESPACE} from './snapshots.mjs';
import {importRecipeUrl,previewRecipeImport,prepareRecipeImportSave} from './recipe-import.mjs';
import {fastingView} from './fasting.mjs';
import {createCloudPhotoAnalyzer} from './cloud-photo.mjs';
import {validateStoredPhoto} from './domain/photo-images.mjs';
import {stagePhotoMedia} from './photo-storage.mjs';
import {loadCatalogIndex} from './catalog-index.mjs';
import {foodInsightOptions,foodOracle,foodSuggestions,previewFoodSuggestion,resolveFoodInsightIngredient} from './food-insights.mjs';
import {Client,Functions,Account,Users,TablesDB,Storage,ID,Permission,Role,Query} from 'node-appwrite';
import {createHash} from 'node:crypto';
import {createDataRepository} from './data-repository.mjs';
import {createWorkspaceStore} from './workspace-store.mjs';
import {previewDiaryItem,captureCatalogFood} from './domain/workspace.mjs';
import {validateAction,validateLibraryPreview,previewLibrary,readActionFoods,captureActionFoods} from './workspace-commands.mjs';
import {libraryView,libraryItem} from './library-view.mjs';
import {targetView,reportView} from './nutrition-views.mjs';
import {csvReport} from './chart-view.mjs';
import {chartSurfaceView} from './dashboard-pinned-charts.mjs';
import {repeatView} from './repeat-view.mjs';
import {recordOptions,recordView,exerciseSearch,exerciseEstimateView} from './record-views.mjs';
import {targetPolicyView} from './target-policy-view.mjs';
import {captureCalendar} from './domain/calendar.mjs';

async function reviewedPhoto(value){try{return await validateStoredPhoto(value);}catch(error){if(error.status===400)throw Object.assign(error,{code:400,publicMessage:'Choose a valid reviewed photo.'});throw error;}}

export function createAppwriteService(config, key, userAgent='') {
  const client=()=>new AccountOperationClient().setEndpoint(config.endpoint).setProject(config.project).setForwardedUserAgent(userAgent);
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
    try {await new TablesDB(elevated()).createRow({...args,data:{timeZone:'UTC',units:'metric'},permissions:[Permission.read(Role.user(account.$id))]});}
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
  async function csvImports(secret){const {owner}=await data(secret);return createCsvImportStore({db:new TablesDB(elevated()),ownerId:owner,reviewSecret:process.env.PHOTO_REVIEW_SECRET});}
  async function pushStore(secret){const {owner}=await data(secret);await createWorkspaceStore(new TablesDB(elevated()),owner).create();return createWebPushStore({db:new TablesDB(elevated()),ownerId:owner,origin:config.origin,vapid:{publicKey:process.env.WEB_PUSH_PUBLIC_KEY,privateKey:process.env.WEB_PUSH_PRIVATE_KEY}});}
  async function reminderStore(secret){const {owner}=await data(secret);await createWorkspaceStore(new TablesDB(elevated()),owner).create();return createReminderScheduleStore({db:new TablesDB(elevated()),ownerId:owner,origin:config.origin,vapid:{publicKey:process.env.WEB_PUSH_PUBLIC_KEY,privateKey:process.env.WEB_PUSH_PRIVATE_KEY}});}
  async function backups(secret){const {owner}=await data(secret),server=elevated();return createBackupStore({db:new TablesDB(server),storage:new Storage(server),ownerId:owner});}
  const lifecycle=()=>createAccountLifecycle({db:new TablesDB(elevated()),database:config.database});
  const deletion=()=>createAccountDeletion({db:new TablesDB(elevated()),storage:new Storage(elevated()),users:new Users(elevated()),lifecycle:lifecycle(),database:config.database});
  const service={
    async prepareAccountDeletion(secret,{password}){const account=await new Account(session(secret)).get();await confirmAccountPassword({account,password,budget,auth:new Account(elevated()),users:new Users(elevated())});return deletion().prepare(account.$id);},
    async confirmAccountDeletion(secret,ticket){const account=await new Account(session(secret)).get();return deletion().begin(ticket,account.$id);},
    async accountDeletionStatus(ticket){return deletion().status(ticket,{advance:true});},
    async nutrientDetail(secret,input){return readView(secret,state=>nutrientDetail(state,input));},
    async reportNutrientDetail(secret,input){const {owner}=await data(secret),calendar=await calendarContext(secret,owner);return readView(secret,state=>reportNutrientDetail(state,input,{now:new Date(calendar.asOf),timeZone:calendar.timeZone}));},
    async diaryToolsReview(secret,input){return readView(secret,state=>diaryToolsReview(state,input));},
    async printReportOptions(secret){const {owner}=await data(secret);return readView(secret,state=>({...printReportOptions(state),accountId:owner}));},
    async previewPrintReport(secret,input){const {owner}=await data(secret),calendar=await calendarContext(secret,owner);return readView(secret,state=>({...previewPrintReport(state,input,{now:new Date(calendar.asOf),timeZone:calendar.timeZone}),accountId:owner}));},
    async barcodeLookup(secret,input){const {owner}=await data(secret);validateBarcodeLookup(input);await takeBrandedBudget(new TablesDB(elevated()),{database:config.database,owner,operation:'product'});return readView(secret,state=>lookupBarcode(state,input,{owner,reviewSecret:process.env.PHOTO_REVIEW_SECRET}));},
    async brandedSearch(secret,input){const {owner}=await data(secret);validateBrandedSearch(input);await takeBrandedBudget(new TablesDB(elevated()),{database:config.database,owner,operation:'search'});return searchBranded(input);},
    async barcodePreview(secret,input){const {owner}=await data(secret);return readView(secret,state=>previewBarcode(state,input,{owner,reviewSecret:process.env.PHOTO_REVIEW_SECRET}));},
    async barcodeSave(secret,input){const {owner,repository}=await data(secret);if(input?.type!=='barcode.log')throw Object.assign(Error('Choose a barcode action.'),{code:400});return createWorkspaceStore(new TablesDB(elevated()),owner).command(input,catalogReader(repository),{owner,reviewSecret:process.env.PHOTO_REVIEW_SECRET});},
    async libraryShare(secret,input){return readView(secret,state=>exportLibraryItem(state,input));},
    async librarySharePreview(secret,input){return readView(secret,state=>previewSharedImport(state,input));},
    async libraryFoodPrint(secret,input){const {owner}=await data(secret);return readView(secret,state=>({...previewFoodPrint(state,input),accountId:owner}));},
    async coachPreferences(secret){return readView(secret,coachView);},
    async coachAnswer(secret,input){return readView(secret,state=>coachAnswer(state,input));},
    async dashboard(secret,date){const {owner}=await data(secret),context=await calendarContext(secret,owner);return readView(secret,state=>dashboardView(state,{date},context));},
    async offlineSnapshot(secret){const {owner}=await data(secret),store=createWorkspaceStore(new TablesDB(elevated()),owner);await store.create();return store.offlineSnapshot();},
    async offlineCommand(secret,input){const {owner}=await data(secret),calendar=await calendarContext(secret,owner);return createWorkspaceStore(new TablesDB(elevated()),owner).offlineCommand(input,calendar);},
    async reminders(secret){return {...await (await pushStore(secret)).status(),...await (await reminderStore(secret)).status()};},
    async saveReminder(secret,input){return (await reminderStore(secret)).save(input);},
    async deleteReminder(secret,input){return (await reminderStore(secret)).remove(input);},
    async reminderSettings(secret,input){return (await reminderStore(secret)).settings(input);},
    async subscribePush(secret,input){return (await pushStore(secret)).subscribe(input);},
    async unsubscribePush(secret,input){return (await pushStore(secret)).unsubscribe(input);},
    async testPush(secret,input){return (await pushStore(secret)).test(input);},
    async parseTextLog(secret,input){return insights(secret,input,parseTextFoodLog);},
    async previewCsvImport(secret,input){return (await csvImports(secret)).preview(input);},
    async importCsv(secret,input){return (await csvImports(secret)).import(input);},
    async favorites(secret){return readView(secret,favoriteView);},
    async nutritionLabel(secret){return readView(secret,nutritionLabelView);},
    async previewNutritionLabel(secret,input){return readView(secret,state=>nutritionLabelPreview(state,input));},
    async exportBackup(secret){return (await backups(secret)).export();},
    async listRecoveries(secret){return (await backups(secret)).listRecoveries();},
    async inspectRecovery(secret,input){return (await backups(secret)).inspectRecovery(input);},
    async inspectBackup(secret,input){return (await backups(secret)).inspect(input);},
    async uploadBackupMedia(secret,input){return (await backups(secret)).upload(input);},
    async restoreBackup(secret,input){return (await backups(secret)).restore(input);},
    async profileSettings(secret,date){return readView(secret,state=>profileSettingsView(state,date));},
    async snapshots(secret){return readView(secret,snapshotsView);},
    async prepareNotePhoto(secret,input){await data(secret);return prepareNotePhoto(input);},
    async saveNotePhoto(secret,input){
      const allowed=['requestId','revision','id','recordRevision','fields','photo'];
      const invalid=()=>{throw Object.assign(Error('Invalid note fields.'),{code:400,publicMessage:'Invalid note fields.'});};
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==allowed.length||allowed.some(key=>!Object.hasOwn(input,key)))invalid();
      const supplied=input.photo,photoKeys=supplied?.mode==='replace'?['mode','id','dataUrl']:['mode'];
      if(!supplied||typeof supplied!=='object'||Array.isArray(supplied)||Object.keys(supplied).length!==photoKeys.length||photoKeys.some(key=>!Object.hasOwn(supplied,key)))invalid();
      const payload={id:input.id,recordRevision:input.recordRevision,fields:input.fields,photo:{mode:supplied.mode,...(supplied.mode==='replace'?{id:supplied.id}:{})}},action={type:'note.photo.save',payload};validateNotePhotoAction(action);
      const {owner,repository}=await data(secret),db=new TablesDB(elevated()),storage=new Storage(elevated());
      const photo=supplied.mode==='replace'?await reviewedPhoto({id:supplied.id,dataUrl:supplied.dataUrl}):null;
      return createWorkspaceStore(db,owner).command({requestId:input.requestId,revision:input.revision,...action},catalogReader(repository),photo?{photo,stageMedia:context=>stagePhotoMedia({db,storage,owner,photo,namespace:NOTE_MEDIA_NAMESPACE,...context})}:{});
    },
    async prepareSnapshot(secret,input){return readView(secret,state=>prepareSnapshot(state,input));},
    async saveSnapshot(secret,input){
      const allowed=['requestId','revision','photo','date','time','title','note','vitals','captureMeasurements'];
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))throw Object.assign(Error('Invalid snapshot fields.'),{code:400});
      const {owner,repository}=await data(secret),db=new TablesDB(elevated()),storage=new Storage(elevated());
      const photo=await reviewedPhoto(input.photo),{requestId,revision,photo:ignored,...metadata}=input;
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
    async foodInsightOptions(secret){return readView(secret,state=>foodInsightOptions(state));},
    async foodOracle(secret,input){return insights(secret,input,foodOracle);},
    async foodSuggestions(secret,input){return insights(secret,input,foodSuggestions);},
    async resolveFoodInsightIngredient(secret,input){return insights(secret,input,resolveFoodInsightIngredient);},
    async previewFoodSuggestion(secret,input){return insights(secret,input,previewFoodSuggestion);},
    async analyzePhoto(secret,input,signal){const {owner,repository}=await data(secret);await createWorkspaceStore(new TablesDB(elevated()),owner).create();const state=await repository.readState();return createCloudPhotoAnalyzer().analyze(input,{owner,foods:state.foods,signal,search:(query,{limit})=>repository.search({query,limit,offset:0})});},
    async savePhoto(secret,input){
      const allowed=['requestId','revision','photo','reviewToken','date','time','group','rows'];
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))throw Object.assign(Error('Invalid photo fields.'),{code:400,publicMessage:'Invalid photo fields.'});
      const {owner,repository}=await data(secret),db=new TablesDB(elevated()),storage=new Storage(elevated()),photo=await reviewedPhoto(input.photo);
      const {requestId,revision,reviewToken,date,time,group,rows}=input;
      return createWorkspaceStore(db,owner).command({requestId,revision,type:'photo.log',payload:{photoId:photo.id,reviewToken,date,time,group,rows}},catalogReader(repository),{owner,reviewSecret:process.env.PHOTO_REVIEW_SECRET,photo,stageMedia:context=>stagePhotoMedia({db,storage,owner,photo,...context})});
    },
    async targetPolicies(secret,date){const {owner}=await data(secret),context=await calendarContext(secret,owner);return readView(secret,state=>targetPolicyView(state,date,context));},
    async repeats(secret,date){return readView(secret,state=>repeatView(state,date));},
    async recordOptions(secret,date){return readView(secret,state=>recordOptions(state,date));},
    async recordItem(secret,input){return readView(secret,state=>recordView(state,input));},
    async exercises(secret,input){await data(secret);return exerciseSearch(input);},
    async exerciseEstimate(secret,input){return readView(secret,state=>exerciseEstimateView(state,input));},
    async charts(secret,input){const {owner}=await data(secret),calendar=await calendarContext(secret,owner);return readView(secret,state=>chartSurfaceView(state,input,{now:new Date(calendar.asOf),timeZone:calendar.timeZone}));},
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
    async previewDiary(secret,payload){const {repository}=await data(secret),state=await repository.readState();validateAction({type:payload?.id?'entry.update':'entry.add',payload});const p={...payload};try{if(p.foodId&&!state.foods.some(row=>row.id===p.foodId))p.foodId=captureCatalogFood(state,(await repository.food(p.foodId)).food).id;const preview=previewDiaryItem(state,p);return {...preview,energy:diaryEnergy(state,preview.nutrition.totals.calories)};}catch(error){if([400,409].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}},
    async catalogStatus(secret){return (await data(secret)).repository.catalogStatus();},
    async searchCatalog(secret,input){return (await data(secret)).repository.search(input);},
    async readCatalogFood(secret,id){return (await data(secret)).repository.food(id);},
    async readMedia(secret,namespace,id){const {repository,storage}=await data(secret);const collection=namespace==='progress_photos'?'progressSnapshots':namespace===NOTE_MEDIA_NAMESPACE?'notes':null;if(collection&&!((await repository.readState())[collection]??[]).some(row=>row.imageId===id))throw Object.assign(Error('Photo not found.'),{code:404});const fileId=await repository.media(namespace,id);return storage.getFileView({bucketId:'private-media',fileId});},
    login,
    async register({email,password,name}) {const account=await anonymous().create({userId:ID.unique(),email,password,name});await lifecycle().initialize(account.$id);return login({email,password});},
    async current(secret) {const account=await new Account(session(secret)).get();return {id:account.$id,email:account.email,name:account.name,emailVerified:account.emailVerification,profile:await ensureProfile(secret,account)};},
    async updateProfile(secret,data) {const account=await new Account(session(secret)).get();await ensureProfile(secret,account);return profileData(await new TablesDB(elevated()).updateRow({...profileArgs(account.$id),data}));},
    async logout(secret) {if(secret)await new Account(session(secret)).deleteSession({sessionId:'current'});},
    async requestRecovery({email}) {try{await anonymous().createRecovery({email,url:`${config.origin}/reset-password`});}catch(error){if(!['user_not_found','user_invalid_credentials'].includes(error.type))throw error;}},
    async resetPassword(data) {await anonymous().updateRecovery(data);},
    async requestVerification(secret) {await new Account(session(secret)).createVerification({url:`${config.origin}/verify-email`});},
    async verifyEmail(data) {await anonymous().updateVerification(data);}
  };
  const independent=new Set(['login','register','logout','requestRecovery','resetPassword','verifyEmail','prepareAccountDeletion','confirmAccountDeletion','accountDeletionStatus']);
  return Object.fromEntries(Object.entries(service).map(([name,method])=>[name,independent.has(name)?method:async(secret,...input)=>{
    const account=await new Account(session(secret)).get();
    const result=await lifecycle().run(account.$id,name,operation=>withinAccountOperation(operation,()=>method(secret,...input)));
    const scheduleChanged=['restoreBackup','importCsv'].includes(name)||name==='workspaceCommand'&&/^(?:fast|fasting)\./.test(input[0]?.type??'');
    if(process.env.SCHEDULER_ENABLED==='true'&&scheduleChanged){
      const queueClient=new Client().setEndpoint(config.endpoint).setProject(config.project).setKey(key);
      try{await createFastingDispatcher({db:new TablesDB(queueClient),functions:new Functions(queueClient)}).dispatch(account.$id);}
      catch{console.warn('Fasting delivery remains queued for repair.');}
    }
    const reminderChanged=['workspaceCommand','offlineCommand','restoreBackup','importCsv','barcodeSave','savePhoto','saveNotePhoto','saveSnapshot','saveRecipeImport','saveReminder','deleteReminder','reminderSettings','subscribePush','unsubscribePush','testPush'].includes(name);
    if(process.env.REMINDERS_ENABLED==='true'&&reminderChanged){
      const queueClient=new Client().setEndpoint(config.endpoint).setProject(config.project).setKey(key);
      try{await createReminderDispatcher({db:new TablesDB(queueClient),functions:new Functions(queueClient)}).dispatch(account.$id);}
      catch{console.warn('Reminder delivery remains queued for repair.');}
    }
    return result;
  }]));
}
