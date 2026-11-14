import {Worker} from 'node:worker_threads';

let active=false;
/** One bounded parser worker per server process; termination completes before the slot is released. */
export async function expandRecipeJsonLd(documents,baseIRI){
  if(active)throw Object.assign(Error('Another structured recipe is being read. Retry when it finishes.'),{status:503});
  if(Buffer.byteLength(JSON.stringify(documents))>5000000)throw Object.assign(Error('Recipe JSON-LD input exceeds 5 MB.'),{status:400});
  active=true;let worker,timer;
  try{
    worker=new Worker(new URL('./recipe-jsonld-worker.mjs',import.meta.url),{workerData:{documents,baseIRI},resourceLimits:{maxOldGenerationSizeMb:128,stackSizeMb:4}});
    return await new Promise((resolve,reject)=>{
      const fail=message=>reject(Object.assign(Error(message),{status:400}));
      timer=setTimeout(()=>fail('Recipe JSON-LD parsing exceeded 15 seconds. Paste a smaller recipe source.'),15000);
      worker.once('error',()=>fail('Recipe JSON-LD exceeded its parser resources or could not be read.'));
      worker.once('exit',code=>fail('Recipe JSON-LD parser ended before returning a result (exit '+code+').'));
      worker.once('message',value=>value?.ok===true?resolve(value):fail(value?.error||'Recipe JSON-LD parser returned no result.'));
    });
  }finally{clearTimeout(timer);try{if(worker)await worker.terminate();}finally{active=false;}}
}
