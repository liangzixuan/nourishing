import {licenseNotices} from '../../public/more-source/license-notices.js';
import {existsSync,readFileSync} from 'node:fs';
import {extname,resolve,sep} from 'node:path';
import {barcodeAssets} from '../../scripts/package-barcode-assets.mjs';

const types={
 '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
 '.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.webmanifest':'application/manifest+json'
};

export async function pwaFixtureAssets(){
 const publicRoot=resolve('public');
 const vendor=new Map((await barcodeAssets()).map(asset=>['/'+asset.path,asset]));
 return {get(path){
  if(vendor.has(path))return vendor.get(path);
  if(path==='/login')return {type:'text/html',body:'<!doctype html><title>Sign in</title>'};
  const file=resolve(publicRoot,'.'+(path==='/diary'?'/diary.html':path));
  const type=types[extname(file)]??(licenseNotices.some(([,notice])=>notice===path)?'text/plain':null);
  if(type&&file.startsWith(publicRoot+sep)&&existsSync(file))return {type,body:readFileSync(file)};
 }};
}
