import sharp from 'sharp';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const source=new URL('../public/favicon.svg',import.meta.url),destination=new URL('../public/pwa-icons/',import.meta.url);
export async function buildPwaIcons(){
 const svg=await readFile(source);await mkdir(destination,{recursive:true});
 for(const size of [180,192,512])await sharp(svg).resize(size,size).png().toFile(fileURLToPath(new URL(`icon-${size}.png`,destination)));
 const leaf=await sharp(svg).resize(360,360).png().toBuffer();
 await sharp({create:{width:512,height:512,channels:4,background:'#1C3F33'}}).composite([{input:leaf,left:76,top:76}]).png().toFile(fileURLToPath(new URL('maskable-512.png',destination)));
}
export function pwaPackaging(){return {name:'nourishing-pwa-icons',hooks:{'astro:config:setup':buildPwaIcons}};}
