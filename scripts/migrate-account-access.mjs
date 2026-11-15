import {writeFileSync} from 'node:fs';
import {Query,Permission,Role} from 'node-appwrite';
import {operator,allRows,databaseId} from './operator.mjs';
import {createAccountLifecycle} from '../server/account-lifecycle.mjs';

// Run initialize before deploying the lifecycle gate, then profiles after that deployment is active.
const mode=process.argv[2];
if(!['initialize','profiles'].includes(mode))throw Error('Choose initialize or profiles.');
const {db,users}=operator(),lifecycle=createAccountLifecycle({db}),accounts=[];let after;
do{const page=await users.list({queries:[Query.orderAsc('$id'),Query.limit(100),...(after?[Query.cursorAfter(after)]:[])]});accounts.push(...page.users);after=page.users.length===100?page.users.at(-1).$id:null;}while(after);
const profiles=await allRows(db,'profiles'),accountIds=new Set(accounts.map(row=>row.$id));
if(profiles.some(row=>!accountIds.has(row.$id)))throw Error('A profile has no matching account; inspect before changing access.');
writeFileSync(new URL(`../.local/account-access-${mode}-${Date.now()}.json`,import.meta.url),JSON.stringify({at:new Date().toISOString(),accounts:accounts.map(row=>({id:row.$id,createdAt:row.$createdAt})),profiles:profiles.map(row=>({id:row.$id,permissions:row.$permissions}))}));
let changed=0;
if(mode==='initialize')for(const account of accounts){await lifecycle.initialize(account.$id);changed++;}
else for(const profile of profiles){
 const owner=profile.$id,read=Permission.read(Role.user(owner)),allowed=new Set([read,Permission.update(Role.user(owner)),Permission.delete(Role.user(owner))]);
 if(!Array.isArray(profile.$permissions)||profile.$permissions.some(value=>!allowed.has(value)))throw Error('Unexpected profile access; no change made to this profile.');
 if(profile.$permissions.length===1&&profile.$permissions[0]===read)continue;
 await db.updateRow({databaseId,tableId:'profiles',rowId:owner,permissions:[read]});
 const actual=await db.getRow({databaseId,tableId:'profiles',rowId:owner});if(actual.$permissions.length!==1||actual.$permissions[0]!==read)throw Error('Profile access verification failed.');changed++;
}
console.log(JSON.stringify({mode,accounts:accounts.length,profiles:profiles.length,changed}));
