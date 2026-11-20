import {uiLanguage,t} from './app-language.js';
import {coreText} from './core-cloud-messages.js';
import {escape as e} from './html.js';
import {canShareImage,shareImage,saveImage} from './image-sharing.js';
import {formatMessage} from './dashboard-source/message-format.js';
import {nutrientDisplayName} from './report-source/public/nutrient-language.js';
import {scoreName} from './diary-summary-source/score-labels.js';
import {displayValue,displayUnit} from './dashboard-source/energy-display.js';

function diaryWidgets(diary,language){
 const summary=diary.summary,unit=diary.energyUnit??'kcal';
 const number=(value,digits=1)=>(Number.isFinite(value)?value:0).toLocaleString(language,{maximumFractionDigits:digits});
 const energy=value=>number(displayValue(value??0,'kcal',unit),0)+' '+unit;
 const targets=rows=>(rows??[]).map(row=>({label:nutrientDisplayName(row,language),value:`${number(displayValue(row.value??0,row.unit,unit))} / ${number(displayValue(row.target,row.unit,unit))} ${displayUnit(row.unit,unit)}`,fraction:row.target>0?(row.value??0)/row.target:0}));
 return [
  {id:'energy',title:coreText('diary.energy'),rows:[{label:t('mobileDiary.consumed'),value:energy(summary.energy?.consumed)},{label:t('mobileDiary.expenditure'),value:energy(summary.energy?.expenditure)},{label:t('mobileDiary.remaining'),value:energy(summary.energy?.remaining)}]},
  {id:'macros',title:coreText('diary.macros'),rows:targets(summary.diaryDisplay?.macros)},
  {id:'highlights',title:coreText('diary.highlights'),rows:targets(summary.diaryDisplay?.highlights)},
  {id:'scores',title:t('mobileScoreSettings.title'),rows:(diary.presentation?.scores??[]).map(row=>({label:scoreName(row),value:number(row.value,0)+'%',fraction:(row.value??0)/100}))}
 ];
}

async function prepareWidgetsImage(widgets,date){
 await document.fonts.load('700 32px Karla');await document.fonts.load('28px Lato');
 const canvas=document.createElement('canvas');canvas.width=900;canvas.height=180+widgets.reduce((height,widget)=>height+100+Math.max(1,widget.rows.length)*84,0);
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image unavailable');
 ctx.fillStyle='#101221';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle='#f5f6ff';ctx.font='700 38px Karla';ctx.fillText('Nourishing',40,60);ctx.font='26px Lato';ctx.fillStyle='#b9bbc9';ctx.textAlign='right';ctx.fillText(date,860,60);ctx.textAlign='left';
 let y=100;
 for(const widget of widgets){
  const height=76+Math.max(1,widget.rows.length)*84;
  ctx.fillStyle='#252839';ctx.beginPath();ctx.roundRect(24,y,852,height,20);ctx.fill();
  ctx.fillStyle='#f5f6ff';ctx.font='700 32px Karla';ctx.fillText(widget.title,48,y+45,804);
  for(const [index,row] of widget.rows.entries()){
   const top=y+92+index*84;ctx.font='28px Lato';ctx.fillStyle='#f5f6ff';ctx.fillText(row.label,48,top,420);
   ctx.textAlign='right';ctx.fillText(row.value,852,top,360);ctx.textAlign='left';
   if(row.fraction!==undefined){ctx.fillStyle='#45485b';ctx.fillRect(48,top+17,804,8);ctx.fillStyle='#45c7ce';ctx.fillRect(48,top+17,804*Math.min(1,Math.max(0,row.fraction)),8);}
  }
  y+=height+24;
 }
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Image unavailable');
 return new File([blob],`nourishing-diary-${date}.png`,{type:'image/png'});
}

export function openDiaryShare(diary,{show,header,content}){
 const language=uiLanguage(),widgets=diaryWidgets(diary,language),selected=new Set(widgets.map(row=>row.id));
 const message=key=>formatMessage(language,'discover.share.'+key),title=coreText('diary.shareWidgets');
 show(header(title)+'<section class="diary-share"></section>');const root=content.querySelector('.diary-share');
 let disposed=false,url=null,generation=0,stage='choose';
 const alive=()=>!disposed&&root.isConnected;
 const clearImage=()=>{generation++;if(url)URL.revokeObjectURL(url);url=null;};
 function choose(){
  clearImage();stage='choose';
  root.innerHTML=`<div class="diary-share-choices">${widgets.map(row=>`<label><input type="checkbox" value="${row.id}" ${selected.has(row.id)?'checked':''}><span>${e(row.title)}</span></label>`).join('')}</div><footer class="entry-actions"><button type="button" class="primary" ${selected.size?'':'disabled'}>${e(t('mobileFoodEditor.next'))}</button></footer>`;
  root.onchange=event=>{const input=event.target;if(input.type!=='checkbox')return;input.checked?selected.add(input.value):selected.delete(input.value);root.querySelector('button').disabled=!selected.size;};
  root.querySelector('button').onclick=preview;
 }
 async function preview(){
  clearImage();const serial=generation;stage='preview';root.onchange=null;
  root.innerHTML=`<div class="diary-share-preview"><p role="status">${e(message('preparing'))}</p></div><footer class="entry-actions"><button type="button" data-back>${e(t('mobileFoodEditor.back'))}</button><button type="button" class="primary" data-share disabled>${e(message('button'))}</button></footer>`;
  root.querySelector('[data-back]').onclick=choose;
  try{
   const file=await prepareWidgetsImage(widgets.filter(row=>selected.has(row.id)),diary.date);if(!alive()||serial!==generation)return;
   url=URL.createObjectURL(file);root.querySelector('.diary-share-preview').innerHTML=`<img src="${url}" alt="${e(title)}"><p role="status"></p>`;
   const button=root.querySelector('[data-share]');let download=!canShareImage(file);button.disabled=false;button.textContent=message(download?'save':'button');
   button.onclick=async()=>{if(download){saveImage(file);return;}button.disabled=true;try{const result=await shareImage(file,'Nourishing · '+title);if(result==='unavailable'&&alive()){download=true;button.textContent=message('save');}}catch{if(alive())root.querySelector('[role=status]').textContent=message('failed');}finally{if(alive())button.disabled=false;}};
  }catch{if(alive()&&serial===generation)root.querySelector('[role=status]').textContent=message('failed');}
 }
 choose();
 return {dispose(){disposed=true;clearImage();},back(){if(stage!=='preview')return false;choose();return true;}};
}
