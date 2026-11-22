import {supportEmail} from './support-contact.js';

const crlf=text=>text.replace(/\r\n|\r|\n/g,'\r\n');
const base64=bytes=>btoa(String.fromCharCode(...bytes));
const photoExtensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/heic':'heic','image/heif':'heif','image/avif':'avif','image/svg+xml':'svg'};

export function photoType(file){
 const type=file.type.toLowerCase();
 if(/^image\/[a-z0-9.+-]+$/.test(type))return type;
 if(type)return '';
 const ext=file.name.split('.').pop().toLowerCase();
 return Object.keys(photoExtensions).find(key=>photoExtensions[key]===ext||key==='image/jpeg'&&ext==='jpeg')??'';
}

export function correctionMailto(subject,body){
 return 'mailto:'+supportEmail+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(crlf(body));
}

async function appendBase64(parts,blob,signal){
 // Multiples of 57 input bytes produce complete 76-character MIME lines.
 const chunk=57*512;
 for(let offset=0;offset<blob.size;offset+=chunk){
  signal.throwIfAborted();
  const bytes=new Uint8Array(await blob.slice(offset,offset+chunk).arrayBuffer());
  parts.push(base64(bytes).replace(/.{1,76}/g,line=>line+'\r\n'));
 }
}

export async function correctionDraft({subject,body,photos,signal}){
 const boundary='nourishing-'+crypto.randomUUID();
 const subjectHeader='=?UTF-8?B?'+base64(new TextEncoder().encode(subject))+'?=';
 // The composing mail client supplies the sender. X-Unsent is a client hint for opening an editable draft.
 const parts=[[
  'X-Unsent: 1','Date: '+new Date().toUTCString().replace(/GMT$/,'+0000'),
  'To: '+supportEmail,'Subject: '+subjectHeader,'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="'+boundary+'"','','--'+boundary,
  'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',''
 ].join('\r\n')];
 await appendBase64(parts,new Blob([crlf(body)]),signal);
 for(const {role,file} of photos){
  const type=photoType(file);
  if(!type||!['package-front','nutrition-label'].includes(role))throw Error('Invalid photo');
  const filename=role+'.'+(photoExtensions[type]??'img');
  parts.push('--'+boundary+'\r\nContent-Type: '+type+'\r\nContent-Disposition: attachment; filename="'+filename+'"\r\nContent-Transfer-Encoding: base64\r\n\r\n');
  await appendBase64(parts,file,signal);
 }
 parts.push('--'+boundary+'--\r\n');
 return new Blob(parts,{type:'message/rfc822'});
}
