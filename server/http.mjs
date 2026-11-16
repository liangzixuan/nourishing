import {CSV_BODY_BYTES} from './csv-import.mjs';
import {deletionCookie,readDeletionTicket} from './deletion-cookie.mjs';
import {BARCODE_BODY_BYTES} from './barcode.mjs';
import {Readable} from 'node:stream';
import {readSession,sessionCookie,clearSession} from './session-cookie.mjs';
const fail=(code,message)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
function fields(value,names){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!names.includes(k)))fail(400,'Check the form and try again.');return value;}
function string(value,min,max){if(typeof value!=='string'||value.length<min||value.length>max)fail(400,'Check the form and try again.');return value;}
function credentials(body,register){fields(body,register?['email','password','name']:['email','password']);const email=string(body.email,3,320).trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Enter a valid email.');return {email,password:string(body.password,8,256),...(register?{name:string(body.name,1,128).trim()}: {})};}
async function readBody(req,limit=16384){let size=0,chunks=[];for await(const chunk of req.body??[]){size+=chunk.length;if(size>limit)fail(413,'Request too large.');chunks.push(Buffer.from(chunk));}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'Invalid request.');}}
export function createWebHandler({config,service,serviceForRequest,assets=new Map()}) {
  return async req=>{
    const headers=new Headers();
    headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');
    headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json=(status,value)=>{headers.set('Content-Type','application/json; charset=utf-8');return new Response(JSON.stringify(value),{status,headers});};
    try {
      const url=new URL(req.url,config.origin),path=url.pathname;
      if(req.method==='GET'&&path==='/healthz')return json(200,{status:'ok',service:'nourishing-cloud-accounts'});
      if(req.method==='GET'&&!path.startsWith('/api/')) {
        const asset=assets.get(path)||(['/', '/login','/register','/forgot-password','/reset-password','/verify-email','/account'].includes(path)?assets.get('/'):undefined);
        if(!asset)fail(404,'Not found.');headers.set('Content-Type',asset.type);return new Response(asset.body,{headers});
      }
      if(!['GET','POST','PUT'].includes(req.method))fail(405,'Method not allowed.');
      if(req.method!=='GET'){
        if(req.headers.get('origin')!==config.origin)fail(403,'Request origin not allowed.');
        if(req.headers.get('content-type')?.split(';')[0]!=='application/json')fail(415,'Use JSON.');
      }
      const api=service??serviceForRequest(req),secret=readSession(req.headers.get('cookie')??'');
      const deletionRoute=req.method==='POST'&&['/api/account/deletion/prepare','/api/account/deletion/confirm','/api/account/deletion/status'].includes(path);
      if(deletionRoute){
        if(url.search)fail(400,'Invalid account request.');
        if(!path.endsWith('/status')){if(!secret)fail(401,'Please sign in.');await api.current(secret);}
        const input=await readBody(req),ticket=readDeletionTicket(req.headers.get('cookie')??'');
        if(path.endsWith('/prepare')){fields(input,['password']);const prepared=await api.prepareAccountDeletion(secret,{password:string(input.password,8,256)});headers.set('Set-Cookie',deletionCookie(prepared.ticket));return json(200,prepared.status);}
        if(!ticket)fail(404,'Deletion receipt not found.');
        if(path.endsWith('/confirm')){fields(input,['confirmation']);if(input.confirmation!=='delete')fail(400,'Confirm account deletion.');const result=await api.confirmAccountDeletion(secret,ticket);headers.set('Set-Cookie',clearSession());return json(result.status==='deleted'?200:202,result);}
        fields(input,[]);return json(200,await api.accountDeletionStatus(ticket));
      }
      if(req.method==='GET'&&path==='/api/offline'){if(!secret)fail(401,'Please sign in.');if(url.search)fail(400,'Invalid offline request.');return json(200,await api.offlineSnapshot(secret));}
      const offlineRequest=req.method==='POST'&&path==='/api/offline/commands';
      if(offlineRequest){if(!secret)fail(401,'Please sign in.');await api.current(secret);if(url.search)fail(400,'Invalid offline request.');}
      if(req.method==='GET'&&path==='/api/reminders'){if(!secret)fail(401,'Please sign in.');if(url.search)fail(400,'Invalid notification request.');return json(200,await api.reminders(secret));}
      const pushRequest=req.method==='POST'&&['/api/reminders/subscribe','/api/reminders/unsubscribe','/api/reminders/test','/api/reminders/schedule','/api/reminders/schedule/delete','/api/reminders/settings'].includes(path);
      if(pushRequest){if(!secret)fail(401,'Please sign in.');await api.current(secret);if(url.search)fail(400,'Invalid notification request.');}
      const cycleRequest=req.method==='POST'&&['/api/cycle/preview','/api/cycle/import','/api/cycle/removal-preview','/api/cycle/remove'].includes(path);
      if(cycleRequest){if(!secret)fail(401,'Please sign in.');await api.current(secret);if(url.search)fail(400,'Invalid cycle request.');}
      if(req.method==='GET'&&['/api/glucose-timeline','/api/cycle'].includes(path)){
        if(!secret)fail(401,'Please sign in.');const keys=path==='/api/cycle'?['from','to']:['from','to','compare'];
        if([...url.searchParams.keys()].some(key=>!keys.includes(key)||url.searchParams.getAll(key).length!==1)||!url.searchParams.has('from')||!url.searchParams.has('to'))fail(400,'Choose a date range.');
        const input=Object.fromEntries(url.searchParams);if(Object.hasOwn(input,'compare')){try{input.compare=JSON.parse(input.compare);}catch{fail(400,'Choose a comparison.');}}
        return json(200,await api[path==='/api/cycle'?'cycleView':'glucoseTimeline'](secret,input));
      }
      const sharingRequest=req.method==='POST'&&['/api/library/share/preview','/api/library/share/import','/api/library/food-print'].includes(path);
      if(sharingRequest){if(!secret)fail(401,'Please sign in.');await api.current(secret);if(url.search)fail(400,'Invalid library request.');}
      const coachRequest=req.method==='POST'&&path==='/api/coach/answer';
      if(coachRequest){if(!secret)fail(401,'Please sign in.');await api.current(secret);if(url.search)fail(400,'Invalid Coach request.');}
      const textRequest=req.method==='POST'&&path==='/api/text-log/parse';
      if(textRequest){if(!secret)fail(401,'Please sign in.');await api.current(secret);if(url.search)fail(400,'Invalid text log request.');}
      const csvRequest=req.method==='POST'&&['/api/imports/csv/preview','/api/imports/csv/import'].includes(path);
      if(csvRequest){if(!secret)fail(401,'Please sign in.');await api.current(secret);if(url.search)fail(400,'Invalid CSV request.');}
      const photoRequest=req.method==='POST'&&['/api/photos/analyze','/api/photos/save','/api/snapshots/prepare','/api/snapshots/save','/api/note-photos/prepare','/api/note-photos/save'].includes(path);
      // Authenticate before reading multi-megabyte image bodies. Limits include base64 expansion.
      if(photoRequest){if(!secret)fail(401,'Please sign in.');await api.current(secret);if(url.search)fail(400,'Invalid photo request.');}
      const recipeRequest=req.method==='POST'&&['/api/recipe-import','/api/recipe-import/preview','/api/recipe-import/save'].includes(path);
      // Recipe source evidence can approach the domain's 16 MiB review limit.
      if(recipeRequest){if(!secret)fail(401,'Please sign in.');await api.current(secret);if(url.search)fail(400,'Invalid recipe request.');}
      const backupRequest=req.method==='POST'&&['/api/backup/inspect','/api/backup/media','/api/backup/restore','/api/backup/recovery/inspect'].includes(path);
      if(backupRequest){if(!secret)fail(401,'Please sign in.');await api.current(secret);if(url.search)fail(400,'Invalid backup request.');}
      const libraryCommand=req.method==='POST'&&path==='/api/library/command',ingredientRequest=req.method==='POST'&&['/api/diary/ingredients/preview','/api/diary/ingredients/save'].includes(path);
      if(libraryCommand||ingredientRequest){if(!secret)fail(401,'Please sign in.');await api.current(secret);if(url.search)fail(400,'Invalid editor request.');}
      const barcodeRequest=req.method==='POST'&&['/api/barcode/lookup','/api/barcode/preview','/api/barcode/save','/api/branded/search'].includes(path);
      if(barcodeRequest){if(!secret)fail(401,'Please sign in.');await api.current(secret);if(url.search)fail(400,'Invalid barcode request.');}
      const printRequest=req.method==='POST'&&path==='/api/print-report/preview';
      if(printRequest){if(!secret)fail(401,'Please sign in.');await api.current(secret);if(url.search)fail(400,'Invalid report query.');}
      const diaryToolsRequest=req.method==='POST'&&['/api/diary/tools/review','/api/diary/tools/save'].includes(path),nutrientRequest=req.method==='POST'&&['/api/nutrient-detail','/api/nutrition-report/nutrient'].includes(path);
      if(diaryToolsRequest||nutrientRequest){if(!secret)fail(401,'Please sign in.');await api.current(secret);if(url.search)fail(400,'Invalid diary query.');}
      const body=req.method==='GET'?null:await readBody(req,(sharingRequest||cycleRequest)?20_000_000:offlineRequest?601_000:textRequest?60_100:csvRequest?CSV_BODY_BYTES:barcodeRequest?BARCODE_BODY_BYTES:(libraryCommand||ingredientRequest||printRequest||diaryToolsRequest||path==='/api/nutrient-detail')?4*1024*1024:backupRequest?(path==='/api/backup/inspect'?20_000_000:path.endsWith('/media')?5*1024*1024:16384):photoRequest?((path.endsWith('/analyze')||path.endsWith('/prepare'))?12:5)*1024*1024:recipeRequest&&path!=='/api/recipe-import'?16*1024*1024:16384);
      if(cycleRequest){
        if(path.endsWith('/preview'))return json(200,await api.cycleImportPreview(secret,body));
        if(path.endsWith('/removal-preview'))return json(200,await api.cycleRemovalPreview(secret,body));
        if(body?.type!==(path.endsWith('/import')?'cycle.import':'cycle.remove'))fail(400,'Choose a cycle action.');
        return json(200,await api.workspaceCommand(secret,body));
      }
      if(sharingRequest){
        if(path.endsWith('/preview'))return json(200,await api.librarySharePreview(secret,body));
        if(path.endsWith('/food-print')){fields(body,['id','includeNotes']);return json(200,await api.libraryFoodPrint(secret,body));}
        if(body?.type!=='share.import')fail(400,'Choose a shared library item.');return json(200,await api.workspaceCommand(secret,body));
      }
      if(offlineRequest)return json(200,await api.offlineCommand(secret,body));
      if(textRequest)return json(200,await api.parseTextLog(secret,body));
      if(pushRequest)return json(200,await api[{'/api/reminders/subscribe':'subscribePush','/api/reminders/unsubscribe':'unsubscribePush','/api/reminders/test':'testPush','/api/reminders/schedule':'saveReminder','/api/reminders/schedule/delete':'deleteReminder','/api/reminders/settings':'reminderSettings'}[path]](secret,body));
      if(csvRequest)return json(200,await api[path.endsWith('/preview')?'previewCsvImport':'importCsv'](secret,body));
      if(req.method==='GET'&&['/api/library/favorites','/api/library/label'].includes(path)){if(!secret)fail(401,'Please sign in.');if(url.search)fail(400,'Invalid library request.');return json(200,await api[path.endsWith('/favorites')?'favorites':'nutritionLabel'](secret));}
      if(req.method==='POST'&&path==='/api/library/label/preview'){if(!secret)fail(401,'Please sign in.');if(url.search)fail(400,'Invalid label request.');return json(200,await api.previewNutritionLabel(secret,body));}
      if(nutrientRequest)return json(200,await api[path==='/api/nutrient-detail'?'nutrientDetail':'reportNutrientDetail'](secret,body));
      if(diaryToolsRequest){if(path.endsWith('/review'))return json(200,await api.diaryToolsReview(secret,body));if(!['records.copy','records.clear-amounts','records.move-group','records.set-time','records.delete','selection.meal','diary.order','group.order'].includes(body?.type))fail(400,'Choose a diary action.');return json(200,await api.workspaceCommand(secret,body));}
      if(printRequest)return json(200,await api.previewPrintReport(secret,body));
      if(req.method==='GET'&&path==='/api/print-report/options'){if(!secret)fail(401,'Please sign in.');if(url.search)fail(400,'Invalid report query.');return json(200,await api.printReportOptions(secret));}
      if(barcodeRequest)return json(200,await api[{'/api/barcode/lookup':'barcodeLookup','/api/barcode/preview':'barcodePreview','/api/barcode/save':'barcodeSave','/api/branded/search':'brandedSearch'}[path]](secret,body));
      if(libraryCommand){if(!['library.portions','library.retirement'].includes(body?.type))fail(400,'Choose a library action.');return json(200,await api.workspaceCommand(secret,body));}
      if(ingredientRequest){if(path.endsWith('/preview'))return json(200,await api.previewEntryAdjustment(secret,body));if(body?.type!=='entry.ingredients.adjust')fail(400,'Choose an ingredient action.');return json(200,await api.workspaceCommand(secret,body));}
      if(req.method==='GET'&&path==='/api/diary/ingredients'){if(!secret)fail(401,'Please sign in.');const keys=['kind','date','id'];if([...url.searchParams.keys()].some(k=>!keys.includes(k)||url.searchParams.getAll(k).length!==1)||keys.some(k=>!url.searchParams.has(k)))fail(400,'Choose a diary item.');return json(200,await api.entryAdjustment(secret,Object.fromEntries(url.searchParams)));}
      if(backupRequest){const method=path==='/api/backup/recovery/inspect'?'inspectRecovery':path.endsWith('/inspect')?'inspectBackup':path.endsWith('/media')?'uploadBackupMedia':'restoreBackup';return json(200,await api[method](secret,body));}
      if(req.method==='GET'&&path==='/api/backup/recoveries'){if(!secret)fail(401,'Please sign in.');if(url.search)fail(400,'Invalid recovery query.');return json(200,await api.listRecoveries(secret));}
      if(req.method==='GET'&&path==='/api/backup/export'){if(!secret)fail(401,'Please sign in.');if(url.search)fail(400,'Invalid backup query.');return json(200,await api.exportBackup(secret));}
      if(photoRequest){const method={'/api/photos/analyze':'analyzePhoto','/api/photos/save':'savePhoto','/api/snapshots/prepare':'prepareSnapshot','/api/snapshots/save':'saveSnapshot','/api/note-photos/prepare':'prepareNotePhoto','/api/note-photos/save':'saveNotePhoto'}[path];return json(200,await api[method](secret,body,req.signal));}
      if(req.method==='GET'&&path==='/api/snapshots'){if(!secret)fail(401,'Please sign in.');if(url.search)fail(400,'Invalid query.');return json(200,await api.snapshots(secret));}
      if(recipeRequest){const method=path.endsWith('/preview')?'previewRecipeImport':path.endsWith('/save')?'saveRecipeImport':'importRecipe';return json(200,await api[method](secret,body));}
      if(req.method==='GET'&&path==='/api/fasting'){
        if(!secret)fail(401,'Please sign in.');
        if([...url.searchParams.keys()].some(k=>!['offset','limit','revision'].includes(k)||url.searchParams.getAll(k).length!==1))fail(400,'Invalid fasting query.');
        const p=Object.fromEntries(url.searchParams);for(const key of ['offset','limit'])if(p[key]!==undefined){if(!/^(?:0|[1-9]\d*)$/.test(p[key]))fail(400,'Invalid history page.');p[key]=Number(p[key]);}
        return json(200,await api.fasting(secret,p));
      }
      if(path.startsWith('/api/food-insights/')){
        if(!secret)fail(401,'Please sign in.');if(url.search)fail(400,'Invalid food insight query.');
        if(req.method==='GET'&&path==='/api/food-insights/options')return json(200,await api.foodInsightOptions(secret));
        const methods={'/api/food-insights/resolve':'resolveFoodInsightIngredient','/api/food-insights/oracle':'foodOracle','/api/food-insights/suggestions':'foodSuggestions','/api/food-insights/preview':'previewFoodSuggestion'};
        if(req.method==='POST'&&Object.hasOwn(methods,path))return json(200,await api[methods[path]](secret,body));
        fail(404,'Not found.');
      }
      const recordQueries={'/api/repeats':['date'],'/api/records/options':['date'],'/api/records/item':['collection','id'],'/api/records/exercises':['q','offset'],'/api/records/exercise-estimate':['date','code','minutes']};
      if(req.method==='GET'&&Object.hasOwn(recordQueries,path)){
        if(!secret)fail(401,'Please sign in.');const allowed=recordQueries[path];
        if([...url.searchParams.keys()].some(k=>!allowed.includes(k)||url.searchParams.getAll(k).length!==1)||(path!=='/api/records/exercises'&&allowed.some(k=>!url.searchParams.has(k))))fail(400,'Invalid query.');
        const p=Object.fromEntries(url.searchParams);
        if(path==='/api/repeats')return json(200,await api.repeats(secret,p.date));
        if(path==='/api/records/options')return json(200,await api.recordOptions(secret,p.date));
        if(path==='/api/records/item')return json(200,await api.recordItem(secret,p));
        if(path==='/api/records/exercise-estimate'&&!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(p.minutes))fail(400,'Enter exercise minutes.');
        if(p.offset!==undefined&&!/^(?:0|[1-9]\d*)$/.test(p.offset))fail(400,'Invalid exercise search.');
        if(path==='/api/records/exercise-estimate')return json(200,await api.exerciseEstimate(secret,{...p,minutes:Number(p.minutes)}));
        const offset=Number(p.offset??0);if(!Number.isSafeInteger(offset)||offset<0||(p.q?.length??0)>200)fail(400,'Invalid exercise search.');return json(200,await api.exercises(secret,{q:p.q??'',offset}));
      }
      if(req.method==='POST'&&path==='/api/reports/export'){if(!secret)fail(401,'Please sign in.');return json(200,await api.exportReport(secret,body));}
      if(req.method==='GET'&&path==='/api/charts'){
        if(!secret)fail(401,'Please sign in.');
        if([...url.searchParams.keys()].some(k=>!['to','card'].includes(k)||url.searchParams.getAll(k).length!==1)||!url.searchParams.has('to'))fail(400,'Choose chart dates.');
        return json(200,await api.charts(secret,Object.fromEntries(url.searchParams)));
      }
      if(req.method==='GET'&&path==='/api/coach/preferences'){if(!secret)fail(401,'Please sign in.');if(url.search)fail(400,'Invalid query.');return json(200,await api.coachPreferences(secret));}
      if(req.method==='POST'&&path==='/api/coach/answer'){if(!secret)fail(401,'Please sign in.');if(url.search)fail(400,'Invalid query.');fields(body,['date','question','preferencesRevision']);return json(200,await api.coachAnswer(secret,body));}
      if(req.method==='GET'&&['/api/dashboard','/api/targets','/api/target-policies','/api/profile-settings','/api/nutrition-report'].includes(path)){
        if(!secret)fail(401,'Please sign in.');
        const allowed=path!=='/api/nutrition-report'?['date']:['from','to','dayFilter','includeToday','includeSupplements'];
        if([...url.searchParams.keys()].some(k=>!allowed.includes(k)||url.searchParams.getAll(k).length!==1)||allowed.some(k=>!url.searchParams.has(k)))fail(400,'Invalid query.');
        const input=Object.fromEntries(url.searchParams);
        if(path==='/api/dashboard')return json(200,await api.dashboard(secret,input.date));
        if(path==='/api/profile-settings')return json(200,await api.profileSettings(secret,input.date));
        if(path==='/api/targets')return json(200,await api.targets(secret,input.date));
        if(path==='/api/target-policies')return json(200,await api.targetPolicies(secret,input.date));
        for(const key of ['includeToday','includeSupplements']){if(!['true','false'].includes(input[key]))fail(400,'Invalid report filter.');input[key]=input[key]==='true';}
        return json(200,await api.nutritionReport(secret,input));
      }
      if(req.method==='POST'&&path==='/api/workspace/command'){if(!secret)fail(401,'Please sign in.');return json(200,await api.workspaceCommand(secret,body));}
      if(req.method==='POST'&&path==='/api/library/preview'){if(!secret)fail(401,'Please sign in.');return json(200,await api.previewLibrary(secret,body));}
      if(req.method==='GET'&&path==='/api/library'){if(!secret)fail(401,'Please sign in.');if(url.search)fail(400,'Invalid query.');return json(200,await api.library(secret));}
      if(req.method==='GET'&&path==='/api/library/share'){
        if(!secret)fail(401,'Please sign in.');
        if([...url.searchParams.keys()].some(k=>!['kind','id'].includes(k)||url.searchParams.getAll(k).length!==1)||!url.searchParams.has('kind')||!url.searchParams.has('id'))fail(400,'Choose a library item.');
        return json(200,await api.libraryShare(secret,Object.fromEntries(url.searchParams)));
      }
      if(req.method==='GET'&&path==='/api/library/tools'){
        if(!secret)fail(401,'Please sign in.');
        if([...url.searchParams.keys()].some(k=>!['kind','id'].includes(k)||url.searchParams.getAll(k).length!==1)||!url.searchParams.has('kind')||!url.searchParams.has('id'))fail(400,'Choose a library item.');
        return json(200,await api.libraryTools(secret,Object.fromEntries(url.searchParams)));
      }
      if(req.method==='GET'&&path==='/api/library/item'){
        if(!secret)fail(401,'Please sign in.');
        if([...url.searchParams.keys()].some(k=>!['kind','id','entryId'].includes(k)||url.searchParams.getAll(k).length!==1))fail(400,'Invalid query.');
        const kind=url.searchParams.get('kind');if(!['food','recipe','meal'].includes(kind))fail(400,'Choose a library item.');
        return json(200,await api.libraryItem(secret,kind,string(url.searchParams.get('id'),1,1000),url.searchParams.has('entryId')?string(url.searchParams.get('entryId'),1,1000):null));
      }
      if(req.method==='POST'&&path==='/api/diary/preview'){if(!secret)fail(401,'Please sign in.');return json(200,await api.previewDiary(secret,body));}
      if(req.method==='GET'&&['/api/diary','/api/catalog/status','/api/catalog/search','/api/catalog/food','/api/media'].includes(path)){
        if(!secret)fail(401,'Please sign in.');
        const allowed={'/api/diary':['date'],'/api/catalog/status':[],'/api/catalog/search':['q','offset','limit'],'/api/catalog/food':['id'],'/api/media':['namespace','id']}[path];
        if([...url.searchParams.keys()].some(key=>!allowed.includes(key)||url.searchParams.getAll(key).length!==1))fail(400,'Invalid query.');
        if(path==='/api/diary'){const date=url.searchParams.get('date'),parsed=new Date(`${date}T12:00:00Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(date??'')||!Number.isFinite(parsed.valueOf())||parsed.toISOString().slice(0,10)!==date)fail(400,'Choose a valid date.');return json(200,await api.readDiary(secret,date));}
        if(path==='/api/catalog/status')return json(200,await api.catalogStatus(secret));
        if(path==='/api/catalog/search'){const query=url.searchParams.get('q')??'',offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??25);if(query.length>200||!Number.isSafeInteger(offset)||offset<0||offset>100000||!Number.isInteger(limit)||limit<1||limit>100)fail(400,'Invalid search.');return json(200,await api.searchCatalog(secret,{query,offset,limit}));}
        const id=string(url.searchParams.get('id'),1,1000);
        if(path==='/api/catalog/food')return json(200,await api.readCatalogFood(secret,id));
        const namespace=url.searchParams.get('namespace');if(!['meal_photos','note_photos','progress_photos'].includes(namespace)||!/^([a-f0-9]{64})$/.test(id))fail(400,'Invalid image.');
        const bytes=await api.readMedia(secret,namespace,id);headers.set('Content-Type','image/jpeg');return new Response(bytes,{headers});
      }
      if(req.method==='GET'&&path==='/api/account') {if(!secret)fail(401,'Please sign in.');return json(200,await api.current(secret));}
      if(req.method==='PUT'&&path==='/api/profile') {
        fields(body,['timeZone','units']);string(body.timeZone,1,100);try{new Intl.DateTimeFormat('en',{timeZone:body.timeZone});}catch{fail(400,'Choose a valid time zone.');}
        if(!['metric','imperial'].includes(body.units))fail(400,'Choose valid units.');if(!secret)fail(401,'Please sign in.');
        return json(200,await api.updateProfile(secret,{timeZone:body.timeZone,units:body.units}));
      }
      if(req.method!=='POST')fail(404,'Not found.');
      if(path==='/api/auth/register'||path==='/api/auth/login') {
        const register=path.endsWith('/register'),session=await api[register?'register':'login'](credentials(body,register));
        headers.set('Set-Cookie',sessionCookie(session));return json(200,{ok:true});
      }
      if(path==='/api/auth/logout') {fields(body,[]);try{await api.logout(secret);}catch(error){if(error.code!==401)throw error;}finally{headers.set('Set-Cookie',clearSession());}return json(200,{ok:true});}
      if(path==='/api/auth/recovery') {fields(body,['email']);await api.requestRecovery({email:string(body.email,3,320).trim()});return json(200,{ok:true});}
      if(path==='/api/auth/reset') {fields(body,['userId','secret','password']);await api.resetPassword({userId:string(body.userId,1,36),secret:string(body.secret,1,4096),password:string(body.password,8,256)});headers.set('Set-Cookie',clearSession());return json(200,{ok:true});}
      if(path==='/api/auth/verification') {fields(body,[]);if(!secret)fail(401,'Please sign in.');await api.requestVerification(secret);return json(200,{ok:true});}
      if(path==='/api/auth/verify') {fields(body,['userId','secret']);await api.verifyEmail({userId:string(body.userId,1,36),secret:string(body.secret,1,4096)});return json(200,{ok:true});}
      fail(404,'Not found.');
    }catch(error){
      const status=[400,401,403,404,405,409,413,415,429,499,502,503,504,507].includes(error.code)?error.code:503;
      const messages={400:'Check your details or request a new link.',401:'Please sign in. Check your email and password.',403:'This action is not available.',404:'Not found.',409:'An account with these details already exists. Try signing in.',429:'Too many attempts. Try again later.',503:'Unable to connect. Please try again.'};
      return json(status,{error:error.publicMessage??messages[status]??'Request failed.'});
    }
  };
}
export function createHandler(options) {
  const handle=createWebHandler(options);
  return async(req,res)=>{
    const request=new Request(new URL(req.url,options.config.origin),{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Readable.toWeb(req),duplex:'half'})});
    const response=await handle(request);
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}
