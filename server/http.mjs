import {Readable} from 'node:stream';
import {readSession,sessionCookie,clearSession} from './session-cookie.mjs';
const fail=(code,message)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
function fields(value,names){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!names.includes(k)))fail(400,'Check the form and try again.');return value;}
function string(value,min,max){if(typeof value!=='string'||value.length<min||value.length>max)fail(400,'Check the form and try again.');return value;}
function credentials(body,register){fields(body,register?['email','password','name']:['email','password']);const email=string(body.email,3,320).trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Enter a valid email.');return {email,password:string(body.password,8,256),...(register?{name:string(body.name,1,128).trim()}: {})};}
async function readBody(req){let size=0,chunks=[];for await(const chunk of req.body??[]){size+=chunk.length;if(size>16384)fail(413,'Request too large.');chunks.push(Buffer.from(chunk));}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'Invalid request.');}}
export function createWebHandler({config,service,serviceForRequest,assets=new Map()}) {
  return async req=>{
    const headers=new Headers();
    headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');
    headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
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
      const api=service??serviceForRequest(req),secret=readSession(req.headers.get('cookie')??''),body=req.method==='GET'?null:await readBody(req);
      if(req.method==='POST'&&path==='/api/workspace/command'){if(!secret)fail(401,'Please sign in.');return json(200,await api.workspaceCommand(secret,body));}
      if(req.method==='POST'&&path==='/api/library/preview'){if(!secret)fail(401,'Please sign in.');return json(200,await api.previewLibrary(secret,body));}
      if(req.method==='GET'&&path==='/api/library'){if(!secret)fail(401,'Please sign in.');if(url.search)fail(400,'Invalid query.');return json(200,await api.library(secret));}
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
      const status=[400,401,403,404,405,409,413,415,429,503].includes(error.code)?error.code:503;
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
