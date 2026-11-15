import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,parse,isAbsolute} from 'node:path';

const execute=promisify(execFile);
const failure=message=>Object.assign(Error(message),{status:503});
const environmentKeys=['NOURISH_BACKUP_MIRROR_DIRECTORY','NOURISH_BACKUP_MIRROR_VOLUME_ROOT','NOURISH_BACKUP_MIRROR_VOLUME_LABEL','NOURISH_BACKUP_MIRROR_VOLUME_SERIAL'];

export function readBackupMirrorConfig(env=process.env){
  if(!env||typeof env!=='object'||Array.isArray(env))throw Error('External backup environment configuration must be an object.');
  if(environmentKeys.every(key=>!Object.hasOwn(env,key)))return undefined;
  if(environmentKeys.some(key=>!Object.hasOwn(env,key)||typeof env[key]!=='string'||!env[key].trim()))throw Error('Configure all four external backup environment fields with nonempty values.');
  const [directory,root,label,serial]=environmentKeys.map(key=>env[key]),config={directory,volume:{root,label,serial:serial.toUpperCase()}};
  createBackupVolumeGuard(config);return config;
}
// DriveInfo works without the CIM permission required by Get-Volume. The native
// query adds a stable volume serial; its result contains no directory contents.
const script=`$ErrorActionPreference='Stop'
$root=$env:NOURISH_PROBE_VOLUME_ROOT
$drive=[System.IO.DriveInfo]::new($root)
if(-not $drive.IsReady){throw 'The configured external backup volume is disconnected.'}
Add-Type -TypeDefinition 'using System; using System.Text; using System.Runtime.InteropServices; public static class NourishVolume { [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool GetVolumeInformation(string root, StringBuilder label, int labelSize, out uint serial, out uint maximum, out uint flags, StringBuilder format, int formatSize); }'
$label=[System.Text.StringBuilder]::new(261);$format=[System.Text.StringBuilder]::new(261)
[uint32]$serial=0;[uint32]$maximum=0;[uint32]$flags=0
if(-not [NourishVolume]::GetVolumeInformation($root,$label,$label.Capacity,[ref]$serial,[ref]$maximum,[ref]$flags,$format,$format.Capacity)){throw 'The external backup volume identity could not be read.'}
@{root=$drive.Name;label=$drive.VolumeLabel;serial=$serial.ToString('X8');format=$drive.DriveFormat;ready=$drive.IsReady;availableBytes=$drive.AvailableFreeSpace;totalBytes=$drive.TotalSize}|ConvertTo-Json -Compress`;

export async function probeBackupVolume(root){
  if(process.platform!=='win32')throw failure('External backup volume verification requires Windows.');
  let result;
  try{result=await execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:15000,maxBuffer:65536,env:{...process.env,NOURISH_PROBE_VOLUME_ROOT:root}});}
  catch{throw failure('The configured external backup drive is unavailable or its volume identity could not be read. Local daily backups remain available.');}
  try{return JSON.parse(result.stdout.trim());}catch{throw failure('The external backup volume returned an unreadable identity.');}
}

export function createBackupVolumeGuard({directory,volume,probeVolume=probeBackupVolume}){
  if(!volume||typeof volume!=='object'||typeof volume.root!=='string'||typeof volume.label!=='string'||!volume.label||typeof volume.serial!=='string'||!/^[a-fA-F0-9]{8}$/.test(volume.serial))throw Error('External backup configuration requires a volume root, label and eight-digit serial.');
  if(!isAbsolute(volume.root)||typeof directory!=='string'||!isAbsolute(directory))throw Error('External backup directory and volume root must be absolute paths.');
  const root=resolve(volume.root),folder=resolve(directory),expected={root,label:volume.label,serial:volume.serial.toUpperCase()};
  if(parse(root).root!==root||parse(folder).root!==root||folder===root)throw Error('External backups must use a folder on their configured volume root.');
  let observed=null;
  async function check(){
    const current=await probeVolume(root);
    if(!current||current.ready!==true||typeof current.root!=='string'||resolve(current.root)!==root||current.label!==expected.label||typeof current.serial!=='string'||current.serial.toUpperCase()!==expected.serial)throw failure('The configured external drive is disconnected or its label/serial does not match. No external files were changed. Local daily backups remain available.');
    observed={root,label:current.label,serial:current.serial.toUpperCase(),format:current.format??null,availableBytes:current.availableBytes??null,totalBytes:current.totalBytes??null};
    return {...observed};
  }
  return {check,status:()=>({expected:{...expected},observed:observed?{...observed}:null})};
}
