import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const sourceRoot=new URL('../../cronometer-local/public/',import.meta.url),targetRoot=new URL('../public/barcode-source/',import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),decoder=new TextDecoder('utf-8',{fatal:true});
const files=[['barcode-scanner.js','barcode-scanner.js'],['message-formatter.js','message-formatter.js'],['locales/barcode.js','messages.js']];
mkdirSync(targetRoot,{recursive:true});const manifest=[];
for(const [source,target]of files){
 const input=readFileSync(new URL(source,sourceRoot)),original=decoder.decode(input),transforms=['Normalize CRLF line endings to LF'];let output=original.replaceAll('\r\n','\n');
 if(source==='message-formatter.js'){
  const before="'./vendor/i18next/26.7.1/i18next.js'",after="'/vendor/i18next/26.7.1/i18next.js'";
  if(!output.includes(before))throw Error('Unexpected barcode formatter dependency.');output=output.replace(before,after);transforms.push('Resolve the existing i18next import from the packaged /vendor path');
 }
 const bytes=Buffer.from(output,'utf8');writeFileSync(new URL(target,targetRoot),bytes);
 manifest.push({source:'public/'+source,target:'public/barcode-source/'+target,sourceEncoding:'UTF-8',outputEncoding:'UTF-8',transforms,sourceSha256:sha(input),outputSha256:sha(bytes)});
}
writeFileSync(new URL('message-format.js',targetRoot),"import {createMessageFormatter} from './message-formatter.js';\nimport {barcodeMessages} from './messages.js';\nexport const formatMessage=createMessageFormatter(barcodeMessages);\n",'utf8');
writeFileSync(new URL('../docs/barcode-source-manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n','utf8');
console.log(JSON.stringify({copied:manifest.map(row=>row.target),encoding:'UTF-8',sourceRoot:fileURLToPath(sourceRoot)}));
