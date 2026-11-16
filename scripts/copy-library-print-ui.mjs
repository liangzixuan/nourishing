import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {init,parse} from 'es-module-lexer';
import {pathToFileURL} from 'node:url';
await init;
const source=path.resolve('../cronometer-local'),target=path.resolve('public/library-print-source'),aliases=JSON.parse(fs.readFileSync(path.join(source,'package.json'))).imports;
const previous=JSON.parse(fs.readFileSync('docs/print-ui-source.json')).files,files=new Map(),reused=new Map(),hash=value=>createHash('sha256').update(value).digest('hex');
function visit(file){
 const relative=path.relative(source,file).replaceAll('\\','/'),prior=previous.find(row=>row.source===relative),input=fs.readFileSync(file);
 if(prior&&prior.sourceSha256===hash(input)&&fs.existsSync(prior.target)&&hash(fs.readFileSync(prior.target))===prior.outputSha256){reused.set(relative,prior);return path.resolve(prior.target);}
 const output=path.join(target,relative);if(files.has(file))return output;
 let text=input.toString('utf8').replace(/\r\n?/g,'\n');files.set(file,null);const edits=[];
 for(const row of parse(text)[0]){if(row.type==='import-meta')continue;if(row.type!=='static')throw Error('Unsupported dynamic food print dependency: '+relative);const spec=row.specifier;let next;
  if(spec.startsWith('#'))next=path.resolve(source,aliases[spec]);else if(spec.startsWith('.'))next=path.resolve(path.dirname(file),spec);else if(spec.startsWith('/shared/'))next=path.resolve(source,'server',spec.slice(8));else if(spec.startsWith('/'))next=path.resolve(source,'public',spec.slice(1));else throw Error('Unsupported food print dependency: '+spec);
  const rewritten='./'+path.relative(path.dirname(output),visit(next)).replaceAll('\\','/');if(rewritten!==spec)edits.push({...row,spec:rewritten});
 }
 for(const row of edits.reverse())text=text.slice(0,row.start)+row.spec+text.slice(row.end);
 if(relative==='public/food-print-document.js'){text=text.replace('<style>${css(message)}</style>','<link rel="stylesheet" href="/library-print-source/food-${escape(language)}.css">').replace("style-src 'unsafe-inline'","style-src 'self'");text+='\nexport function foodPrintStyles(language){return css((key,values)=>formatMessage(language,key,values));}\n';}
 files.set(file,{output,text,row:{source:relative,target:path.relative(path.resolve('.'),output).replaceAll('\\','/'),sourceSha256:hash(input),outputSha256:hash(text),transforms:['Normalize line endings to LF','Resolve static imports to owned food print sources or verified existing report sources',...(relative==='public/food-print-document.js'?['Export source localized CSS as an external self-only stylesheet']:[])]}});return output;
}
for(const name of ['public/food-print-document.js','public/captured-print-frame.js'])visit(path.join(source,name));
for(const item of files.values()){fs.mkdirSync(path.dirname(item.output),{recursive:true});fs.writeFileSync(item.output,item.text);}
const renderer=await import(pathToFileURL(path.join(target,'public/food-print-document.js')).href),styles=[];for(const language of ['en','fr','de','pt-BR']){const output=path.join(target,'food-'+language+'.css'),text=renderer.foodPrintStyles(language);fs.writeFileSync(output,text);styles.push({target:path.relative(path.resolve('.'),output).replaceAll('\\','/'),sha256:hash(text)});}
fs.writeFileSync('docs/library-print-source-manifest.json',JSON.stringify({version:1,source:'../cronometer-local',files:[...files.values()].map(row=>row.row),reused:[...reused.values()],styles},null,2)+'\n');
console.log(JSON.stringify({copied:files.size,reused:reused.size}));
