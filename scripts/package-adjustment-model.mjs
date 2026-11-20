import {readFile,writeFile,access} from 'node:fs/promises';

/** These pure domain files are consumed by both adapters. Existing nutrition
 * dependencies already have packaged owners in report-source/server. */
export async function packageAdjustmentModel(){
 const copied=new Set();
 async function copy(name){
  if(copied.has(name))return;copied.add(name);
  const body=await readFile(new URL('../server/domain/'+name,import.meta.url));
  await writeFile(new URL('../public/report-source/server/'+name,import.meta.url),body);
  for(const match of body.toString().matchAll(/from ['"]\.\/([^'"]+)['"]/g)){
   try{await access(new URL('../public/report-source/server/'+match[1],import.meta.url));}
   catch{await copy(match[1]);}
  }
 }
 for(const name of ['diary-adjustment-model.mjs','resource-expansion.mjs','resource-quantity.mjs','recipe-portions.mjs','content-digest-input.mjs','entry-update-fields.mjs'])await copy(name);
}
