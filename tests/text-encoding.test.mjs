import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {extname,join} from 'node:path';

test('published source and documentation use valid UTF-8',()=>{
 const decoder=new TextDecoder('utf-8',{fatal:true});
 const check=file=>assert.doesNotThrow(()=>decoder.decode(readFileSync(file)),file);
 function visit(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){
  const file=join(directory,entry.name);
  if(entry.isDirectory())visit(file);
  else if(['.mjs','.js','.css','.html','.json','.md'].includes(extname(file)))check(file);
 }}
 for(const directory of ['public','server','docs'])visit(directory);
 for(const file of ['README.md','MIGRATION.md','PROGRESS.md'])check(file);
});
