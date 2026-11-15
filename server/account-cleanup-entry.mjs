import {Client,TablesDB,Storage,Users} from 'node-appwrite';
import {createAccountLifecycle} from './account-lifecycle.mjs';
import {createAccountDeletion} from './account-deletion.mjs';
import {runAccountCleanup} from './account-cleanup-worker.mjs';

export function parseCleanupRequest(body){
 if(body===undefined||body==='')return {};
 try{
  const input=typeof body==='string'?JSON.parse(body):body;
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||typeof input.jobId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.jobId))throw Error();
  return {jobId:input.jobId};
 }catch{throw Object.assign(Error('Invalid cleanup request.'),{code:400});}
}

/** Private Appwrite Function. Empty execute permissions; scheduler controls its invocation. */
export default async function accountCleanupEntry({req,res,log=()=>{},error=()=>{}}){
 if(process.env.ACCOUNT_CLEANUP_ENABLED!=='true')return res.json({ok:true,enabled:false},200);
 let selection;try{selection=parseCleanupRequest(req?.bodyText??req?.body);}catch{return res.json({ok:false,error:'Invalid cleanup request.'},400);}
 try{
  const endpoint=process.env.APPWRITE_FUNCTION_API_ENDPOINT,project=process.env.APPWRITE_FUNCTION_PROJECT_ID,key=req?.headers?.['x-appwrite-key'];
  if(!endpoint||!project||typeof key!=='string'||!key)throw Error('Cleanup credentials unavailable.');
  const client=new Client().setEndpoint(endpoint).setProject(project).setKey(key),db=new TablesDB(client),storage=new Storage(client),users=new Users(client),database=process.env.APPWRITE_DATABASE_ID||'nourishing';
  const lifecycle=createAccountLifecycle({db,database}),deletion=createAccountDeletion({db,storage,users,lifecycle,database});
  const result=await runAccountCleanup({db,deletion,database,enabled:true,...selection});log(JSON.stringify(result));return res.json({ok:result.failed===0,...result},result.failed?500:200);
 }catch{error('Account cleanup could not complete.');return res.json({ok:false,error:'Account cleanup could not complete.'},500);}
}
