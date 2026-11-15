import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {init,parse} from 'es-module-lexer';
await init;
const source=path.resolve('../cronometer-local'),target=path.resolve('public/offline-source'),aliases=JSON.parse(fs.readFileSync(path.join(source,'package.json'))).imports;
const previous=JSON.parse(fs.readFileSync('docs/print-ui-source.json')).files,files=new Map(),reused=new Map(),hash=value=>createHash('sha256').update(value).digest('hex');
function visit(file){
 const relative=path.relative(source,file).replaceAll('\\','/'),prior=previous.find(row=>row.source===relative),input=fs.readFileSync(file);
 if(prior&&prior.sourceSha256===hash(input)&&fs.existsSync(prior.target)&&hash(fs.readFileSync(prior.target))===prior.outputSha256){reused.set(relative,prior);return path.resolve(prior.target);}
 const output=path.join(target,relative);if(files.has(file))return output;
 let text=input.toString('utf8').replace(/\r\n?/g,'\n');files.set(file,null);const edits=[];
 for(const row of parse(text)[0]){if(row.type==='import-meta')continue;if(row.type!=='static')throw Error('Unsupported dynamic offline dependency: '+relative);const spec=row.specifier;let next;
  if(spec.startsWith('#'))next=path.resolve(source,aliases[spec]);else if(spec.startsWith('.'))next=path.resolve(path.dirname(file),spec);else if(spec.startsWith('/shared/'))next=path.resolve(source,'server',spec.slice(8));else if(spec.startsWith('/'))next=path.resolve(source,'public',spec.slice(1));else throw Error('Unsupported offline dependency: '+spec);
  const rewritten='./'+path.relative(path.dirname(output),visit(next)).replaceAll('\\','/');if(rewritten!==spec)edits.push({...row,spec:rewritten});
 }
 for(const row of edits.reverse())text=text.slice(0,row.start)+row.spec+text.slice(row.end);
 files.set(file,{output,text,row:{source:relative,target:path.relative(path.resolve('.'),output).replaceAll('\\','/'),sourceSha256:hash(input),outputSha256:hash(text),transforms:['Normalize line endings to LF','Resolve static imports to owned offline sources or verified existing report sources']}});return output;
}
for(const name of ['public/offline-quantity.js','public/offline-record.js','public/offline-meal.js','public/offline-exercise.js','public/offline-biometric-log.js','server/diary-record-fields.mjs','server/biometric-log-fields.mjs','server/biometric-library.mjs','server/nutrition.mjs','server/resource-quantity.mjs'])visit(path.join(source,name));
for(const item of files.values()){fs.mkdirSync(path.dirname(item.output),{recursive:true});fs.writeFileSync(item.output,item.text);}
fs.writeFileSync('docs/offline-source-manifest.json',JSON.stringify({version:1,source:'../cronometer-local',files:[...files.values()].map(row=>row.row),reused:[...reused.values()]},null,2)+'\n');
console.log(JSON.stringify({copied:files.size,reused:reused.size}));
