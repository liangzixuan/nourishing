import {parentPort,workerData} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import jsonld from 'jsonld';

const bytes=readFileSync(new URL('./schemaorg-context.json',import.meta.url));
const source=JSON.parse(readFileSync(new URL('./schemaorg-context-source.json',import.meta.url),'utf8'));
const contexts=new Set(['http://schema.org','https://schema.org','http://schema.org/','https://schema.org/','http://schema.org/docs/jsonldcontext.json','https://schema.org/docs/jsonldcontext.json','http://schema.org/docs/jsonldcontext.jsonld','https://schema.org/docs/jsonldcontext.jsonld']);
try{
  if(createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('The bundled Schema.org context does not match its source hash.');
  const context=JSON.parse(bytes.toString('utf8')),used=new Set();
  const expanded=[];
  for(const document of workerData.documents){const part=await jsonld.expand(document,{base:workerData.baseIRI,expandContext:{'@vocab':'https://schema.org/'},safe:true,
    documentLoader:async url=>{
      if(!contexts.has(url))throw Error('External JSON-LD contexts are not fetched. Use an inline or Schema.org context, or paste plain recipe text.');
      used.add(url);return {contextUrl:null,documentUrl:url,document:context};
    }});for(const node of part)expanded.push(node);}

  const encoded=JSON.stringify(expanded);
  if(Buffer.byteLength(encoded)>16777216)throw Error('Expanded JSON-LD exceeds the 16 MiB recipe parsing limit.');
  parentPort.postMessage({ok:true,expanded,contexts:[...used].map(url=>({url,sourceUrl:source.url,sha256:source.sha256}))});
}catch(error){parentPort.postMessage({ok:false,error:'Recipe JSON-LD could not be expanded: '+(error.details?.cause?.message||error.message).slice(0,700)});}
