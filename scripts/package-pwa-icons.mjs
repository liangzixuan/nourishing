import sharp from 'sharp';
import {readFile,mkdir,writeFile} from 'node:fs/promises';

const publicRoot=new URL('../public/',import.meta.url);
export async function buildPwaIcons(){
 const svg=await readFile(new URL('favicon.svg',publicRoot));
 const icons=[];
 for(const size of [180,192,512]){
  icons.push({path:`pwa-icons/icon-${size}.png`,body:await sharp(svg).resize(size,size).png().toBuffer()});
 }
 const leaf=await sharp(svg).resize(360,360).png().toBuffer();
 const mask=await sharp({create:{width:512,height:512,channels:4,background:'#1C3F33'}}).composite([{input:leaf,left:76,top:76}]).png().toBuffer();
 icons.push({path:'pwa-icons/maskable-512.png',body:mask});
 await mkdir(new URL('pwa-icons/',publicRoot),{recursive:true});
 for(const icon of icons)await writeFile(new URL(icon.path,publicRoot),icon.body);
 return icons;
}
