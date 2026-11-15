import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
test('barcode scanner copies retain verified UTF-8 text and declared source transforms',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../docs/barcode-source-manifest.json',import.meta.url),'utf8')),decoder=new TextDecoder('utf-8',{fatal:true});
 for(const row of manifest){const bytes=readFileSync(new URL('../'+row.target,import.meta.url)),text=decoder.decode(bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),row.outputSha256,row.target);assert.equal(row.outputEncoding,'UTF-8');assert.equal(text.includes('\ufffd'),false);}
 const scanner=decoder.decode(readFileSync(new URL('../public/barcode-source/barcode-scanner.js',import.meta.url))),messages=decoder.decode(readFileSync(new URL('../public/barcode-source/messages.js',import.meta.url)));
 assert.ok(scanner.includes('package’s full UPC number'));assert.ok(messages.includes('Escanear código de barras'));assert.ok(messages.includes('Schließen'));
});
