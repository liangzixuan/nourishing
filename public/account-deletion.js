import {downloadBackup} from './backup.js';

/** The receipt is an HttpOnly cookie. No account identity or credentials are retained here. */
export function createAccountDeletion({root,request,onSignIn}){
 const lifecycle=new AbortController(),call=(path,body)=>request(path,body,'POST',lifecycle.signal);
 let disposed=false,dialog=null,operation=null,timer=null,inFlight=false,active=false;
 const alive=()=>!disposed&&root.isConnected;
 const clearTimer=()=>{clearTimeout(timer);timer=null;};
 const clearDialog=()=>{operation?.abort();operation=null;if(dialog){dialog.querySelector('form')?.reset();dialog.close();dialog.remove();dialog=null;}};
 const links='<nav class="links"><a href="/login">Sign in</a><a href="/register">Create account</a></nav>';
 function screen(title,text,{retry=false,ready=false}={}){
  if(!alive())return;clearDialog();root.innerHTML='<h1></h1><p class="notice" role="status"></p>'+(retry?'<button type="button" data-deletion-retry>Try again</button>':'')+(ready?'<button type="button" data-deletion-confirm>Retry deletion</button>':'')+links;
  root.querySelector('h1').textContent=title;root.querySelector('[role=status]').textContent=text;
  root.querySelector('[data-deletion-retry]')?.addEventListener('click',check);
  root.querySelector('[data-deletion-confirm]')?.addEventListener('click',confirm);
 }
 function present(result){
  clearTimer();
  if(!alive())return;
  if(result.status==='deleted'){active=false;screen('Account deleted','Your account and cloud data have been deleted.');return;}
  if(result.status==='pending'){active=true;screen('Deleting account','Deleting your cloud data…');schedule();return;}
  if(result.status==='needs_attention'){active=true;screen('Deletion needs attention','Your account has not been fully deleted. Try again.',{retry:true});return;}
  if(result.status==='ready'){active=true;screen('Deletion not started','Retry to delete your account.',{ready:true});return;}
  throw Error('Could not check deletion. Try again.');
 }
 function schedule(){if(alive()&&active&&!document.hidden)timer=setTimeout(check,2500);}
 async function check(){
  if(!alive()||inFlight||document.hidden)return;clearTimer();inFlight=true;
  try{present(await call('/api/account/deletion/status',{}));}
  catch(error){if(alive()){active=true;screen('Check account deletion',error.status===404?'Deletion status is unavailable. Sign in to check your account.':'Could not check deletion. Try again.',{retry:true});}}
  finally{inFlight=false;}
 }
 async function confirm(){
  if(!alive()||inFlight)return;clearTimer();inFlight=true;active=true;
  // Acceptance may succeed even when the response is lost. Keep private account data off this screen.
  screen('Deleting account','Checking deletion…');
  try{present(await call('/api/account/deletion/confirm',{confirmation:'delete'}));}
  catch{inFlight=false;await check();}
  finally{inFlight=false;}
 }
 function open(){
  if(!alive()||dialog||active)return;
  dialog=document.createElement('dialog');dialog.className='account-delete-dialog';dialog.setAttribute('aria-labelledby','deletion-title');
  dialog.innerHTML='<header><h2 id="deletion-title">Delete account?</h2><button type="button" class="deletion-close" aria-label="Close">×</button></header><section><p>Your cloud diary, photos and retained versions will be deleted. Downloaded backup copies stay on your devices.</p><button type="button" class="secondary" data-deletion-backup>Download backup</button><form><label>Password<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><p class="notice" data-deletion-status role="status"></p><button type="submit" class="danger">Delete account</button></form></section>';
  const current=dialog,form=current.querySelector('form'),status=current.querySelector('[role=status]'),password=form.elements.password;
  const message=text=>{if(current.isConnected)status.textContent=text;};
  const busy=value=>current.querySelectorAll('button:not(.deletion-close),input').forEach(item=>item.disabled=value);
  current.querySelector('.deletion-close').onclick=clearDialog;
  current.oncancel=event=>{event.preventDefault();clearDialog();};
  current.onclick=event=>{if(event.target!==current)return;const r=current.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)clearDialog();};
  current.querySelector('[data-deletion-backup]').onclick=async()=>{
   if(operation)return;operation=new AbortController();const signal=operation.signal;busy(true);message('Preparing backup…');
   try{await downloadBackup({signal,onProgress:message,isCurrent:()=>alive()&&current.isConnected,requestJson:(path,body,signal)=>request(path,body,'GET',signal)});}
   catch(error){if(error.name!=='AbortError')message(error.message);}
   finally{if(current.isConnected){operation=null;busy(false);}}
  };
  form.onsubmit=async event=>{
   event.preventDefault();if(operation)return;const value=password.value;password.value='';operation=new AbortController();const signal=operation.signal;busy(true);message('Checking password…');
   try{await request('/api/account/deletion/prepare',{password:value},'POST',signal);if(alive()&&current.isConnected&&!signal.aborted){operation=null;await confirm();}}
   catch(error){if(error.name!=='AbortError')message(error.message);}
   finally{if(current.isConnected){operation=null;busy(false);}}
  };
  document.body.append(current);current.showModal();password.focus();
 }
 async function recover(){
  try{const result=await request('/api/account/deletion/status',{});if(!alive())return true;if(result.status==='ready'){onSignIn();return true;}present(result);return true;}
  catch(error){if(error.status===404)return false;if(alive()){active=true;screen('Check account deletion','Could not check deletion. Try again.',{retry:true});}return true;}
 }
 const visibility=()=>{clearTimer();if(!document.hidden&&active)check();};document.addEventListener('visibilitychange',visibility);
 return {open,recover,dispose(){disposed=true;lifecycle.abort();active=false;clearTimer();clearDialog();document.removeEventListener('visibilitychange',visibility);}};
}
