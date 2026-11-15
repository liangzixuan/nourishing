import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {init,parse} from 'es-module-lexer';
import {pathToFileURL} from 'node:url';
import {build} from 'vite';

// Reproduce the original script-free report renderer and its browser dependency closure.
await init;
const source=path.resolve('../cronometer-local'),target=path.resolve('public/report-source');
const aliases=JSON.parse(fs.readFileSync(path.join(source,'package.json'))).imports,files=new Map();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const normalizeText=bytes=>bytes.toString('utf8').replace(/\r\n?/g,'\n').replace(/\n+$/,'\n');
if(JSON.parse(fs.readFileSync(path.join(source,'node_modules/big.js/package.json'))).version!=='7.0.1')throw Error('Review big.js version.');
const outputPath=relative=>path.join(target,relative.replace(/^node_modules\/big\.js\//,'vendor/big.js/7.0.1/'));
function visit(file){
 const relative=path.relative(source,file).replaceAll('\\','/'),output=outputPath(relative);
 if(files.has(file))return output;
 const input=fs.readFileSync(file);let text=normalizeText(input);files.set(file,null);
 const [imports]=parse(text),changes=[];
 for(const item of imports){
  if(item.type==='import-meta')continue;
  if(item.type!=='static')throw Error('Review dynamic print dependency: '+relative);
  const spec=item.specifier;let dependency;
  if(spec.startsWith('#'))dependency=path.resolve(source,aliases[spec]);
  else if(spec.startsWith('.'))dependency=path.resolve(path.dirname(file),spec);
  else if(spec.startsWith('/shared/'))dependency=path.resolve(source,'server',spec.slice(8));
  else if(spec==='big.js')dependency=path.join(source,'node_modules/big.js/big.mjs');
  else throw Error('Review print dependency: '+spec);
  const mapped=visit(dependency),rewritten='./'+path.relative(path.dirname(output),mapped).replaceAll('\\','/');
  if(spec!==rewritten)changes.push({...item,spec:rewritten});
 }
 for(const item of changes.reverse())text=text.slice(0,item.start)+item.spec+text.slice(item.end);
 if(relative==='public/print-document.js'){
  const before="html.raw('</title><style>');html.raw(css(m));if(dto.sections.bloodPressure)html.raw(BLOOD_PRESSURE_PRINT_CSS);if(dto.sections.glucoseKetones)html.raw(GLUCOSE_KETONES_PRINT_CSS);html.raw('</style></head><body>');";
  if(!text.includes(before))throw Error('Review report stylesheet producer.');
  text=text.replace(before,`html.raw('</title><link rel="stylesheet" href="/report-source/print-');html.text(language);html.raw('.css"></head><body>');`).replace("style-src \\'unsafe-inline\\'","style-src \\'self\\'");
  text+='\nexport function reportStyles(language){return css(key=>formatMessage(language,"printDocument."+key))+BLOOD_PRESSURE_PRINT_CSS+GLUCOSE_KETONES_PRINT_CSS;}\n';
 }
 if(['public/blood-pressure-renderer.js','public/glucose-ketones-renderer.js'].includes(relative))text=text.replaceAll('style="color:${colors[role]}"','data-print-color="${colors[role]}"');
 if(relative==='public/chart-renderer.js')text=text.replaceAll(' style="stroke:${color}"','');
 files.set(file,{output,text,row:{source:relative,target:path.relative(path.resolve('.'),output).replaceAll('\\','/'),sourceSha256:sha(input),outputSha256:sha(text),transforms:['CRLF and lone CR to LF; one final newline','Resolve static imports within report-source',...(relative==='public/print-document.js'?['Export original CSS formatter; emit localized external stylesheet and self-only style CSP']:[]),...(['public/blood-pressure-renderer.js','public/glucose-ketones-renderer.js'].includes(relative)?['Fixed legend colors use data attributes and static CSS']:[]),...(relative==='public/chart-renderer.js'?['Remove duplicate inline stroke style; retain source SVG stroke attribute']:[])]}});return output;
}
for(const file of ['public/print-document.js','public/captured-print-frame.js'])visit(path.join(source,file));
if(process.argv.includes('--check')){console.log(JSON.stringify({files:files.size,bytes:[...files.values()].reduce((sum,item)=>sum+Buffer.byteLength(item.text),0)}));}
else{
 for(const item of files.values()){fs.mkdirSync(path.dirname(item.output),{recursive:true});fs.writeFileSync(item.output,item.text);}
 for(const relative of ['public/vendor/i18next/26.7.1/LICENSE','public/vendor/i18next/26.7.1/PROVENANCE.json','node_modules/big.js/LICENCE.md']){
  const input=fs.readFileSync(path.join(source,relative)),output=outputPath(relative),text=normalizeText(input);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,text);files.set(relative,{row:{source:relative,target:path.relative(path.resolve('.'),output).replaceAll('\\','/'),sourceSha256:sha(input),outputSha256:sha(text),transforms:['CRLF and lone CR to LF; one final newline',...(relative.startsWith('node_modules/')?['Map verified big.js 7.0.1 into versioned vendor directory']:[])]}});
 }
 const renderer=await import(pathToFileURL(path.join(target,'public/print-document.js')).href);
 const styles=[];
 for(const language of ['en','fr','de','pt-BR']){
  const palette=['#a13e1c','#245b88','#527735','#a34721','#286c92','#536c2d'];
  const text=renderer.reportStyles(language)+'\n'+palette.map(color=>`[data-print-color="${color}"]{color:${color}}`).join('\n');
  const name=`public/report-source/print-${language}.css`;fs.writeFileSync(name,text);styles.push({target:name,sha256:sha(text)});
 }
 await build({configFile:false,logLevel:'error',build:{lib:{entry:path.join(target,'public/print-document.js'),formats:['es'],fileName:()=> 'renderer.js'},outDir:target,emptyOutDir:false,minify:true,copyPublicDir:false}});
 fs.writeFileSync('docs/print-ui-source.json',JSON.stringify({version:1,source:'../cronometer-local',files:[...files.values()].map(item=>item.row)},null,2)+'\n');
 fs.writeFileSync('docs/print-ui-assets.json',JSON.stringify({version:1,transforms:['Export original localized CSS as static files','Bundle original report renderer dependency closure with Vite'],styles,renderer:{target:'public/report-source/renderer.js',sha256:sha(fs.readFileSync(path.join(target,'renderer.js')))}},null,2)+'\n');
 console.log(JSON.stringify({files:files.size}));
}
