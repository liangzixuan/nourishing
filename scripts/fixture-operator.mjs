import {mkdirSync,writeFileSync} from 'node:fs';
import {Query} from 'node-appwrite';
import {operator,allRows,databaseId} from './operator.mjs';
import {createAccountLifecycle} from '../server/account-lifecycle.mjs';
const fail=()=>{throw Error('Fixture ownership is not verified. No account cleanup was performed.');};
const optional=async work=>{try{return await work();}catch(error){if(error.code===404)return null;throw error;}};
const exact=(user,proof)=>user.$id===proof.ownerId&&user.email===proof.email&&user.name===proof.name&&user.$createdAt===proof.createdAt;
/** Explicit test-only wrapper. The ordinary operator retains its original behavior. */
export function createFixtureOperator(connection,{record}={}){
 if(typeof record!=='function')throw Error('Fixture identity recording is required.');
 const owned=new Map(),lifecycle=createAccountLifecycle({db:connection.db}),args=(tableId,rowId)=>({databaseId,tableId,rowId});
 const save=(proof,status)=>{proof.status=status;record({...proof});};
 async function create(input){
  if(!input||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(input.userId)||typeof input.email!=='string'||!input.email.endsWith('@example.com')||!input.email.split('@')[0].includes(input.userId)||typeof input.name!=='string'||!input.name)fail();
  const proof={ownerId:input.userId,email:input.email,name:input.name,startedAt:new Date().toISOString()};save(proof,'creating');
  const user=await connection.users.create(input);proof.createdAt=user.$createdAt;
  if(!proof.createdAt||!exact(user,proof))fail();owned.set(proof.ownerId,proof);save(proof,'created');
  try{await lifecycle.initialize(proof.ownerId);save(proof,'initialized');return user;}
  catch(error){save(proof,'initialization_failed');throw Object.assign(error,{fixtureOwner:proof.ownerId});}
 }
 // Declare the only identity change this fixture is allowed to make before sending it.
 async function prepareIdentityChange({userId,kind,value}){
  const proof=owned.get(userId);if(!proof||proof.expectedIdentity||!['name','email'].includes(kind)||typeof value!=='string')fail();
  if(kind==='name'&&(!value.trim()||value.length>128))fail();
  if(kind==='email'&&(!value.endsWith('@example.com')||!value.split('@')[0].includes(userId)||value.length>320))fail();
  const user=await connection.users.get({userId});if(!exact(user,proof))fail();
  proof.expectedIdentity={name:proof.name,email:proof.email,[kind]:value};save(proof,'identity_change_pending');
 }
 async function confirmIdentityChange({userId}){
  const proof=owned.get(userId);if(!proof?.expectedIdentity)fail();
  const user=await connection.users.get({userId});
  if(!exact(user,{...proof,...proof.expectedIdentity}))fail();
  Object.assign(proof,proof.expectedIdentity);delete proof.expectedIdentity;save(proof,'identity_change_confirmed');
 }
 async function remove({userId}){
  const proof=owned.get(userId);if(!proof)fail();
  const user=await optional(()=>connection.users.get({userId}));
  if(user&&!exact(user,proof)){
   if(!proof.expectedIdentity||!exact(user,{...proof,...proof.expectedIdentity}))fail();
   Object.assign(proof,proof.expectedIdentity);delete proof.expectedIdentity;save(proof,'identity_change_reconciled');
  }
  // Validate the entire owned metadata inventory before making any cleanup mutation.
  const groups=[];
  for(const tableId of ['account_operations','account_deletions']){
   const rows=await allRows(connection.db,tableId,[Query.equal('ownerId',userId)]);if(rows.some(row=>row.ownerId!==userId))fail();groups.push({tableId,rows});
  }
  const gate=await optional(()=>connection.db.getRow(args('account_lifecycle',userId)));if(gate&&gate.ownerId!==userId)fail();
  save(proof,'cleaning');
  for(const {tableId,rows}of groups)for(const row of rows)await optional(()=>connection.db.deleteRow(args(tableId,row.$id)));
  if(gate)await optional(()=>connection.db.deleteRow(args('account_lifecycle',userId)));
  if(user)await optional(()=>connection.users.delete({userId}));save(proof,'cleaned');
 }
 const users=new Proxy(connection.users,{get(target,property){if(property==='create')return create;if(property==='delete')return remove;const value=Reflect.get(target,property,target);return typeof value==='function'?value.bind(target):value;}});
 return {...connection,users,prepareIdentityChange,confirmIdentityChange};
}
export function fixtureOperator(){
 const directory=new URL('../.local/fixture-accounts/',import.meta.url);mkdirSync(directory,{recursive:true});
 return createFixtureOperator(operator(),{record:proof=>writeFileSync(new URL(proof.ownerId+'.json',directory),JSON.stringify(proof,null,2),'utf8')});
}
