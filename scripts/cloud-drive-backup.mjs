import {Client,TablesDB,Storage} from 'node-appwrite';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir,rename,unlink,rmdir,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,basename,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createBackupVolumeGuard} from '../server/domain/backup-mirror.mjs';
import {readCloudBackupSnapshot,validatePortableBackup,MAX_PORTABLE_BACKUP_BYTES} from '../server/cloud-backup-snapshot.mjs';

const FORMAT='nourishing-cloud-drive-v1',archivePattern=/^nourishing-cloud-(\d{4}-\d{2}-\d{2})-([a-f0-9-]{36})$/;
const fail=(message,code=400)=>{throw Object.assign(Error(message),{code});};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fs={readFile,writeFile,mkdir,readdir,rename,unlink,rmdir,lstat};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
export function parseDriveBackupConfig(input){
 if(!exact(input,['version','endpoint','projectId','ownerId','directory','volume','timeZone'])||input.version!==1||!exact(input.volume,['root','label','serial']))fail('Invalid backup configuration.');
 let endpoint;try{endpoint=new URL(input.endpoint);}catch{fail('Invalid backup endpoint.');}
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname.replace(/\/$/,'')!=='/v1')fail('Invalid backup endpoint.');
 for(const key of ['projectId','ownerId'])if(typeof input[key]!=='string'||!/^[a-zA-Z0-9][\w.-]{0,35}$/.test(input[key]))fail('Invalid backup account identity.');
 if(typeof input.directory!=='string'||!isAbsolute(input.directory)||basename(input.directory)!=='NourishCloud'||typeof input.timeZone!=='string')fail('Use the separate NourishCloud backup folder.');
 try{new Intl.DateTimeFormat('en-CA',{timeZone:input.timeZone}).format();}catch{fail('Invalid backup time zone.');}
 const config={...input,endpoint:endpoint.href.replace(/\/$/,''),directory:resolve(input.directory),volume:{...input.volume}};
 createBackupVolumeGuard(config);return config;
}
export function createCloudDriveBackup({config:rawConfig,readSnapshot,guard,now=()=>Date.now(),io=fs}){
 const config=parseDriveBackupConfig(rawConfig),volume=guard??createBackupVolumeGuard(config),dayOf=value=>new Intl.DateTimeFormat('en-CA',{timeZone:config.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(value);let active;
 const child=(...names)=>{const path=resolve(config.directory,...names),pathWithin=relative(config.directory,path);if(!pathWithin||pathWithin.startsWith('..')||isAbsolute(pathWithin))fail('Backup path escaped its destination.');return path;};
 async function directory(){await volume.check();let current=resolve(config.volume.root);for(const segment of relative(current,config.directory).split(/[\\/]/)){current=join(current,segment);try{if((await io.lstat(current)).isSymbolicLink())fail('Backup directory must not be a link.');}catch(error){if(error.code==='ENOENT')break;throw error;}}await io.mkdir(config.directory,{recursive:true});if((await io.lstat(config.directory)).isSymbolicLink())fail('Backup directory must not be a link.');}
 async function inspect(name){
  const match=archivePattern.exec(name);if(!match)return null;const path=child(name),stat=await io.lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink())return null;
  const names=await io.readdir(path);if(names.length!==2||!['backup.json','ownership.json'].every(file=>names.includes(file)))return null;
  const ownerPath=child(name,'ownership.json'),backupPath=child(name,'backup.json'),ownerStat=await io.lstat(ownerPath),backupStat=await io.lstat(backupPath);
  if(!ownerStat.isFile()||ownerStat.isSymbolicLink()||ownerStat.size>8192||!backupStat.isFile()||backupStat.isSymbolicLink()||backupStat.size>MAX_PORTABLE_BACKUP_BYTES)return null;
  const owner=JSON.parse(await io.readFile(ownerPath,'utf8'));
  if(!exact(owner,['format','endpoint','projectId','ownerId','day','identity','createdAt','revision','generation','sha256'])||owner.format!==FORMAT||owner.endpoint!==config.endpoint||owner.projectId!==config.projectId||owner.ownerId!==config.ownerId||owner.day!==match[1]||owner.identity!==match[2]||!Number.isFinite(Date.parse(owner.createdAt))||dayOf(new Date(owner.createdAt))!==owner.day||!/^[a-f0-9]{64}$/.test(owner.revision)||!/^[a-f0-9]{64}$/.test(owner.sha256)||typeof owner.generation!=='string'||!/^[a-zA-Z0-9][\w.-]{0,35}$/.test(owner.generation))return null;
  const bytes=await io.readFile(backupPath);if(sha(bytes)!==owner.sha256)return null;const checked=await validatePortableBackup(JSON.parse(bytes));if(checked.manifest.createdAt!==owner.createdAt)return null;
  return {name,...owner,bytes:bytes.length,summary:checked.summary};
 }
 async function inventory(){await volume.check();const items=[],warnings=[];for(const entry of await io.readdir(config.directory,{withFileTypes:true})){if(!archivePattern.test(entry.name))continue;try{const item=await inspect(entry.name);if(item)items.push(item);else warnings.push('unverified-archive-kept');}catch{warnings.push('unreadable-archive-kept');}}return {items:items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.name.localeCompare(a.name)),warnings};}
 async function work({force=false}={}){
  await directory();const clock=new Date(now());if(!Number.isFinite(+clock))fail('Backup time is invalid.');const day=dayOf(clock),existing=await inventory(),prior=existing.items.find(item=>item.day===day);
  if(prior&&!force)return {status:'current',day,file:join(prior.name,'backup.json'),verifiedAt:clock.toISOString(),warnings:existing.warnings};
  const snapshot=await readSnapshot(),checked=await validatePortableBackup(snapshot.bundle);if(snapshot.manifest.digest!==checked.manifest.digest)fail('Snapshot manifest changed.',409);
  const createdAt=checked.manifest.createdAt,backupDay=dayOf(new Date(createdAt)),identity=randomUUID(),name=`nourishing-cloud-${backupDay}-${identity}`,pendingName='.pending-'+identity,pending=child(pendingName),published=child(name),bytes=Buffer.from(JSON.stringify(snapshot.bundle));if(bytes.length>MAX_PORTABLE_BACKUP_BYTES)fail('Backup file is too large.',413);
  const owner={format:FORMAT,endpoint:config.endpoint,projectId:config.projectId,ownerId:config.ownerId,day:backupDay,identity,createdAt,revision:snapshot.revision,generation:snapshot.generation,sha256:sha(bytes)};let made=false,publishedOk=false;
  try{
   await volume.check();await io.mkdir(pending);made=true;await io.writeFile(child(pendingName,'backup.json'),bytes,{flag:'wx',flush:true});await io.writeFile(child(pendingName,'ownership.json'),JSON.stringify(owner),{flag:'wx',flush:true});
   const reread=await io.readFile(child(pendingName,'backup.json'));if(sha(reread)!==owner.sha256)fail('Backup readback failed.',409);await validatePortableBackup(JSON.parse(reread));const ownership=JSON.parse(await io.readFile(child(pendingName,'ownership.json'),'utf8'));if(JSON.stringify(ownership)!==JSON.stringify(owner))fail('Backup ownership readback failed.',409);
   await volume.check();await io.rename(pending,published);publishedOk=true;
  }finally{if(made&&!publishedOk){await volume.check();for(const file of ['backup.json','ownership.json'])try{await io.unlink(child(pendingName,file));}catch(error){if(error.code!=='ENOENT')throw error;}await io.rmdir(pending);}}
  const scan=await inventory(),warnings=[...existing.warnings,...scan.warnings],days=new Set(),remove=[];
  for(const item of scan.items){if(days.has(item.day)||days.size>=14)remove.push(item);else days.add(item.day);}
  for(const item of remove){try{await volume.check();if(!await inspect(item.name)){warnings.push('changed-archive-kept');continue;}await io.unlink(child(item.name,'backup.json'));await io.unlink(child(item.name,'ownership.json'));await io.rmdir(child(item.name));}catch{warnings.push('retention-incomplete');}}
  return {status:'saved',day:backupDay,file:join(name,'backup.json'),verifiedAt:new Date(now()).toISOString(),counts:checked.summary.counts,photos:checked.summary.photos,warnings};
 }
 return {capture(options){if(!active)active=work(options).finally(()=>{active=null;});return active;},inspect:async name=>{await volume.check();return inspect(name);}};
}
async function main(){
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--config')fail('Use --config with the local configuration path.');
 const config=parseDriveBackupConfig(JSON.parse(await readFile(resolve(args[1]),'utf8'))),key=process.env.NOURISH_BACKUP_API_KEY;delete process.env.NOURISH_BACKUP_API_KEY;if(typeof key!=='string'||!key.trim())fail('Backup credential unavailable.',401);
 const client=new Client().setEndpoint(config.endpoint).setProject(config.projectId).setKey(key),db=new TablesDB(client),storage=new Storage(client);
 const backup=createCloudDriveBackup({config,readSnapshot:()=>readCloudBackupSnapshot({db,storage,ownerId:config.ownerId})});process.stdout.write(JSON.stringify(await backup.capture())+'\n');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{const code=Number.isInteger(error.code)?error.code:['EACCES','EPERM','ENOSPC','ENOENT','EIO','EBUSY','ETIMEDOUT'].includes(error.code)?error.code:'BACKUP_FAILED';process.stderr.write(JSON.stringify({status:'failed',code})+'\n');process.exitCode=1;});
