import {uiLanguage} from './app-language.js';
import {prepareStreakImage} from './streak-source/discover-share.js';
import {canShareImage,shareImage,saveImage} from './image-sharing.js';
import {formatMessage} from './dashboard-source/message-format.js';
import {escape as e} from './html.js';

export function openStreakShare(stats,{show,header,content,language=uiLanguage()}){
 const message=(key,values)=>formatMessage(language,'discover.'+key,values);
 show(`${header(message('share.title'))}<section class="dashboard-panel dc-share"><p role="status">${e(message('share.preparing'))}</p></section>`);
 const host=content.querySelector('.dc-share'),dialog=host.closest('dialog');let disposed=false,url;
 const alive=()=>!disposed&&host.isConnected&&(!dialog||dialog.open);
 const dispose=()=>{if(disposed)return;disposed=true;observer.disconnect();dialog?.removeEventListener('close',dispose);if(url)URL.revokeObjectURL(url);};
 const observer=new MutationObserver(()=>{if(!host.isConnected)dispose();});observer.observe(content,{childList:true});dialog?.addEventListener('close',dispose,{once:true});
 void prepareStreakImage(stats,language).then(file=>{
  if(!alive()){dispose();return;}
  url=URL.createObjectURL(file);const counts=stats?.savedCounts??{},number=value=>value.toLocaleString(language);
  const description=message('share.description',{days:number(stats?.longest??0),food:number(counts.food??0),exercise:number(counts.exercise??0),metric:number(counts.metric??0),fast:number(counts.fast??0)});
  host.innerHTML=`<img class="dc-streak-image" src="${url}" alt="${e(description)}"><div class="dc-share-actions"><button type="button" class="primary">${e(message(canShareImage(file)?'share.button':'share.save'))}</button></div><p role="status"></p>`;
  const button=host.querySelector('button'),status=host.querySelector('[role=status]');let download=!canShareImage(file);
  button.onclick=async()=>{
   if(!alive())return;status.textContent='';if(download){saveImage(file);return;}button.disabled=true;
   try{const result=await shareImage(file,message('share.nativeTitle'));if(result==='unavailable'&&alive()){download=true;button.textContent=message('share.save');}}
   catch{if(alive())status.textContent=message('share.failed');}
   finally{if(alive())button.disabled=false;}
  };
 }).catch(()=>{if(alive())host.querySelector('[role=status]').textContent=message('share.failed');});
 return dispose;
}
