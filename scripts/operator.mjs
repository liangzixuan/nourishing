import {readFileSync} from 'node:fs';
import {Client,TablesDB,Users,Storage} from 'node-appwrite';
export function operator(){
 const config=JSON.parse(readFileSync(new URL('../appwrite.config.json',import.meta.url),'utf8'));
 const key=JSON.parse(readFileSync(new URL('../.local/data-key.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
 if(!key.secret)throw Error('Temporary operator key missing.');
 const client=new Client().setEndpoint(config.endpoint).setProject(config.projectId).setKey(key.secret);
 return {config,client,db:new TablesDB(client),users:new Users(client),storage:new Storage(client)};
}
export const databaseId='nourishing';
export const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function maybeGet(db,tableId,rowId){try{return await db.getRow({databaseId,tableId,rowId});}catch(error){if(error.code===404)return null;throw error;}}
export async function allRows(db,tableId,queries=[]){
 const {Query}=await import('node-appwrite');let after;const rows=[];
 do{const page=await db.listRows({databaseId,tableId,queries:[...queries,Query.limit(100),Query.orderAsc('$id'),...(after?[Query.cursorAfter(after)]:[])],total:false});rows.push(...page.rows);after=page.rows.length===100?page.rows.at(-1).$id:null;}while(after);
 return rows;
}
