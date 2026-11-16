import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {init,parse} from 'es-module-lexer';
await init;
const source=path.resolve('../cronometer-local'),target=path.resolve('public/health-source'),aliases=JSON.parse(fs.readFileSync(path.join(source,'package.json'))).imports;
const previous=JSON.parse(fs.readFileSync('docs/print-ui-source.json')).files,files=new Map(),reused=new Map(),hash=value=>createHash('sha256').update(value).digest('hex');
function visit(file){
 const relative=path.relative(source,file).replaceAll('\\','/'),prior=previous.find(row=>row.source===relative),input=fs.readFileSync(file);
 if(prior&&prior.sourceSha256===hash(input)&&fs.existsSync(prior.target)&&hash(fs.readFileSync(prior.target))===prior.outputSha256){reused.set(relative,prior);return path.resolve(prior.target);}
 const output=path.join(target,relative);if(files.has(file))return output;
 let text=input.toString('utf8').replace(/\r\n?/g,'\n');files.set(file,null);const edits=[];
 for(const row of parse(text)[0]){if(row.type==='import-meta')continue;if(row.type!=='static')throw Error('Unsupported dynamic health dependency: '+relative);const spec=row.specifier;let next;
  if(spec.startsWith('#'))next=path.resolve(source,aliases[spec]);else if(spec.startsWith('.'))next=path.resolve(path.dirname(file),spec);else if(spec.startsWith('/shared/'))next=path.resolve(source,'server',spec.slice(8));else if(spec.startsWith('/'))next=path.resolve(source,'public',spec.slice(1));else throw Error('Unsupported health dependency: '+spec);
  const rewritten='./'+path.relative(path.dirname(output),visit(next)).replaceAll('\\','/');if(rewritten!==spec)edits.push({...row,spec:rewritten});
 }
 for(const row of edits.reverse())text=text.slice(0,row.start)+row.spec+text.slice(row.end);
 if(relative==='public/mobile-cgm-stats.js')text=text.replace('<img src="/more-icons/chevron-right.svg" alt="">','<span aria-hidden="true">⌄</span>');
 files.set(file,{output,text,row:{source:relative,target:path.relative(path.resolve('.'),output).replaceAll('\\','/'),sourceSha256:hash(input),outputSha256:hash(text),transforms:[...(relative==='public/mobile-cgm-stats.js'?['Replace external chevron image with text glyph']:[]),'Normalize line endings to LF','Resolve static imports to owned health sources or verified existing report sources']}});return output;
}
for(const name of ['public/glucose-timeline.js','public/mobile-cgm-stats.js','public/mobile-cgm-foods.js','public/locales/mobile-charts.js'])visit(path.join(source,name));
for(const item of files.values()){fs.mkdirSync(path.dirname(item.output),{recursive:true});fs.writeFileSync(item.output,item.text);}
const stylesheet=fs.readFileSync(path.join(source,'public/glucose-timeline.css')),styleTarget='public/health-source/glucose-timeline.css',styleOutput=stylesheet.toString('utf8').replace(/\r\n?/g,'\n');fs.writeFileSync(styleTarget,styleOutput);
fs.writeFileSync('docs/health-ui-source.json',JSON.stringify({version:1,source:'../cronometer-local',files:[...files.values()].map(row=>row.row),reused:[...reused.values()],styles:[{source:'public/glucose-timeline.css',target:styleTarget,sourceSha256:hash(stylesheet),outputSha256:hash(styleOutput),transforms:['Normalize line endings to LF']}]},null,2)+'\n');
console.log(JSON.stringify({copied:files.size,reused:reused.size}));
