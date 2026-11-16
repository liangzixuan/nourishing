import {parseFontScale} from './font-source/font-scale.mjs';
// All text uses the browser's default size as its base. PWA code cannot read a native font multiplier.
let scale=1;
export function applyFontPreferences(settings={}){
 const custom=parseFontScale(settings.fontScale),next=settings.matchDeviceFontSize===true?1:custom;
 document.documentElement.style.fontSize='calc(var(--nourishing-font-base, 112.5%) * '+next+')';
 document.documentElement.dataset.fontScale=String(next);
 document.documentElement.style.setProperty('--nourishing-text-scale',String(parseFloat(getComputedStyle(document.documentElement).fontSize)/18));
 if(next!==scale){scale=next;window.dispatchEvent(new Event('nourishing:fontchange'));}
}
