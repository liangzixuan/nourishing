import {formatMessage} from '../dashboard-source/message-format.js';
const message=(language,key,values)=>formatMessage(language,'discover.'+key,values);
// Prepare one image for both the preview and the user's chosen export.
export async function prepareStreakImage(stats,language='en'){
 const t=(key,values)=>message(language,key,values),number=value=>value.toLocaleString(language);
 await Promise.all(['700 34px Karla','32px Lato','700 32px Lato','44px "Material Symbols Rounded"'].map(font=>document.fonts.load(font)));
 const canvas=document.createElement('canvas');canvas.width=900;canvas.height=890;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error(t('share.failed'));
 ctx.fillStyle='#252839';ctx.fillRect(0,0,900,890);ctx.fillStyle='#454d5b';
 for(const [x,y,r,rotation] of [[700,24,50,.2],[822,97,57,.45],[900,194,46,.1]]){
  ctx.beginPath();for(let i=0;i<10;i++){const angle=rotation+i*Math.PI/5,rad=i%2?r*.53:r;const px=x+Math.cos(angle)*rad,py=y+Math.sin(angle)*rad;if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);}ctx.closePath();ctx.fill();
 }
 ctx.fillStyle='#f5f6ff';ctx.font='700 34px Karla';ctx.fillText(t('share.line1'),48,94,804);ctx.fillText(t('share.line2'),48,134,804);
 ctx.fillStyle='#b2d3d4';ctx.font='700 76px Karla';ctx.fillText(t('share.days',{count:number(stats?.longest??0)}),48,220,804);
 ctx.fillStyle='#3e4152';ctx.beginPath();ctx.roundRect(48,272,804,505,24);ctx.fill();
 ctx.fillStyle='#f5f6ff';ctx.font='700 34px Karla';ctx.fillText(t('share.stats'),82,338,736);
 const rows=[['food','nutrition','#f5d0bf','#d91010'],['exercise','directions_run','#c4ebed','#00b8c4'],['metric','vital_signs','#f2cce8','#c5399c'],['fast','timer','#c2ecd8','#00a5a0']];
 rows.forEach(([key,symbol,background,foreground],index)=>{
  const label=t('streak.'+key);
  const y=414+index*99;ctx.fillStyle=background;ctx.beginPath();ctx.arc(116,y,33,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=foreground;ctx.font='44px "Material Symbols Rounded"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(symbol,116,y);
  ctx.textAlign='left';ctx.fillStyle='#f5f6ff';ctx.font='32px Lato';ctx.fillText(label,180,y);
  const width=ctx.measureText(label+'  ').width;ctx.font='700 32px Lato';ctx.fillText(number(stats?.savedCounts?.[key]??0),180+width,y);
 });
 ctx.fillStyle='#f5f6ff';ctx.font='700 44px Karla';ctx.fillText('Nourishing',48,839);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error(t('share.failed'));
 return new File([blob],'nourishing-streak.png',{type:'image/png'});
}
