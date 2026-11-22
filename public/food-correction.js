import {escape as e} from './html.js';
import {fc} from './food-cloud-messages.js';
import {t} from './app-language.js';
import {correctionDraft,correctionMailto,foodCorrectionRecipient,photoType} from './food-correction-email.js';

export function openFoodCorrection({host,anchor,signal,foodName,source,foodId,serving}){
 const dialog=document.createElement('dialog'),lifetime=new AbortController(),subject=fc('correctionSubject');
 const context=[[fc('issueFood'),foodName],[fc('issueSource'),source],[fc('issueFoodId'),foodId],[fc('issueServing'),serving]].filter(([,value])=>value);
 const names=['package-front','nutrition-label'];
 const photos=names.map((name,i)=>`<div class="mf-issue-photo"><label>${e(fc(i?'issueLabel':'issueFront'))}<input type="file" name="${name}" accept="image/*"></label><button type="button" data-remove="${name}" hidden>${e(fc('issueRemove'))}</button></div>`).join('');
 const dl=context.map(([label,value])=>`<dt>${e(label)}</dt><dd>${e(value)}</dd>`).join('');
 dialog.className='mf-issue';dialog.setAttribute('aria-labelledby','mf-issue-title');
 dialog.innerHTML=`<header><h2 id="mf-issue-title">${e(fc('issue'))}</h2><button type="button" data-cancel aria-label="${e(t('common.close'))}">×</button></header>
  <form><dl><dt>${e(fc('issueTo'))}</dt><dd>${e(foodCorrectionRecipient)}</dd>${dl}</dl>
  <label>${e(fc('issueDescribe'))}<textarea name="description" rows="4" required></textarea></label>
  ${photos}<p class="mf-issue-hint" hidden>${e(fc('issueAttachments'))}</p><p role="status"></p>
  <div class="mf-issue-actions"><a data-compose>${e(fc('issueCompose'))}</a><button type="submit">${e(fc('issueDownload'))}</button></div></form>`;
 host.append(dialog);
 const form=dialog.querySelector('form'),description=form.elements.description,status=form.querySelector('[role=status]');
 const compose=form.querySelector('[data-compose]'),save=form.querySelector('[type=submit]'),hint=form.querySelector('.mf-issue-hint');
 const selected=()=>names.flatMap(role=>{const file=form.elements.namedItem(role).files[0];return file?[{role,file}]:[];});
 const body=()=>context.map(([key,value])=>key+': '+value).join('\n')+'\n\n'+description.value.trim();
 let downloading=false;
 function refresh(){
  const attachments=selected(),bad=attachments.some(({file})=>!photoType(file));
  hint.hidden=!attachments.length;
  for(const button of form.querySelectorAll('[data-remove]'))button.hidden=!form.elements.namedItem(button.dataset.remove).files.length;
  const ready=!!description.value.trim()&&!bad;
  if(ready)compose.href=correctionMailto(subject,body());else compose.removeAttribute('href');
  compose.setAttribute('aria-disabled',String(!ready));save.disabled=!ready||downloading;
  status.textContent=bad?fc('issueImageOnly'):'';
 }
 function close(){
  lifetime.abort();form.reset();dialog.close();dialog.remove();
  if(anchor.isConnected)anchor.focus({preventScroll:true});
 }
 function back(event){event.preventDefault();event.stopImmediatePropagation();close();}
 signal.addEventListener('abort',close,{once:true,signal:lifetime.signal});
 dialog.addEventListener('cancel',back);
 window.addEventListener('nourishing-back',back,{capture:true,signal:lifetime.signal});
 dialog.querySelector('[data-cancel]').onclick=close;
 form.oninput=refresh;form.onchange=refresh;
 for(const button of form.querySelectorAll('[data-remove]'))button.onclick=()=>{form.elements.namedItem(button.dataset.remove).value='';refresh();form.elements.namedItem(button.dataset.remove).focus();};
 form.onsubmit=async event=>{
  event.preventDefault();if(save.disabled||!form.reportValidity())return;
  downloading=true;refresh();
  try{
   const draft=await correctionDraft({subject,body:body(),photos:selected(),signal:lifetime.signal});
   if(!dialog.isConnected||lifetime.signal.aborted)return;
   const url=URL.createObjectURL(draft),link=document.createElement('a');
   link.href=url;link.download='nourishing-food-correction.eml';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
   status.textContent=fc('issueDownloaded');
  }catch{if(dialog.isConnected)status.textContent=fc('issueReadFailed');}
  finally{downloading=false;save.disabled=!compose.hasAttribute('href');}
 };
 refresh();dialog.showModal();
}
