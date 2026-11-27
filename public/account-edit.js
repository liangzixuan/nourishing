import {accountMessage as m} from './account-cloud-messages.js';
import {escape as esc} from './html.js';

const validIdentity=(value,id)=>value?.id===id&&typeof value.name==='string'&&typeof value.email==='string'&&typeof value.emailVerified==='boolean';
const label=key=>m('accountCloud.'+key);
const passwordField=(name,text,autocomplete)=>`<label>${text}<input name="${name}" type="password" autocomplete="${autocomplete}" minlength="8" maxlength="256" required></label>`;

/** Credentials stay in the open dialog and the provider requests that consume them. */
export function createAccountEditor({root,request,onSaved,onQueueName}){
 let dialog=null,disposed=false,cleanup=null;
 function remove(){
  if(!dialog)return;
  cleanup();dialog.close();dialog.remove();dialog=null;cleanup=null;
 }
 function open(kind,user,trigger){
  if(disposed||dialog||!['name','email','password'].includes(kind))return;
  const current=document.createElement('dialog');
  dialog=current;current.className='account-edit-dialog';current.setAttribute('aria-labelledby','account-edit-title');
  current.innerHTML=`<h2 tabindex="-1" autofocus id="account-edit-title"></h2><form><div data-edit-fields></div><p class="notice" data-edit-status role="status"></p><div class="account-edit-actions"><button type="button" data-edit-cancel>${m('mobileWeightGoal.cancel')}</button><button type="submit"></button></div></form><button type="button" class="secondary" data-edit-check hidden>${label('checkAccount')}</button><nav class="links" data-edit-recovery hidden><a href="/login">${label('signIn')}</a><a href="/forgot-password">${label('resetPassword')}</a></nav>`;
  const form=current.querySelector('form'),fields=form.querySelector('[data-edit-fields]'),title=current.querySelector('h2');
  const submit=form.querySelector('[type=submit]'),cancel=form.querySelector('[data-edit-cancel]'),status=form.querySelector('[data-edit-status]');
  const checkButton=current.querySelector('[data-edit-check]'),recovery=current.querySelector('[data-edit-recovery]');
  const lifetime=new AbortController(),alive=()=>!disposed&&dialog===current;
  let gate=kind!=='name',confirmedPassword='',confirmedSession='',email=user.email,saving=false,verifying=false,uncertain=false,desired=null;
  const forget=()=>{confirmedPassword='';confirmedSession='';};
  const clearInputs=()=>form.querySelectorAll('input[type=password]').forEach(input=>{input.value='';});
  cleanup=()=>{lifetime.abort();forget();clearInputs();form.reset();};
  const close=()=>{if(saving||verifying)return;remove();trigger?.focus();};
  const controls=()=>{if(!alive())return;for(const element of form.elements)element.disabled=saving||verifying||uncertain;cancel.disabled=saving;checkButton.disabled=saving;};
  function render(){
   current.dataset.stage=gate?'confirm':kind;
   title.textContent=gate?label('enterPassword'):kind==='name'?m('settings.name'):label(kind==='email'?'changeEmail':'changePassword');
   submit.textContent=gate?label('continueEdit'):m('mobileWeightGoal.save');
   if(gate){
    fields.innerHTML=`<p id="account-edit-reason">${label('reauthReason')}</p><input aria-label="${label('currentPassword')}" aria-describedby="account-edit-reason" placeholder="${label('password')}" name="currentPassword" type="password" autocomplete="current-password" minlength="8" maxlength="256" required>`;
   }else if(kind==='name'){
    fields.innerHTML=`<input aria-label="${m('settings.name')}" placeholder="${label('enterName')}" name="name" value="${esc(user.name)}" autocomplete="name" maxlength="128" required>`;
   }else if(kind==='email'){
    fields.innerHTML=`<label>${m('clients.email')}<input name="email" type="email" value="${esc(email)}" autocomplete="email" maxlength="320" required></label><p class="muted">${label('verifyYourNewEmailAfterSaving')}</p>`;
   }else{
    fields.innerHTML=passwordField('password',label('newPassword'),'new-password')+passwordField('confirmPassword',label('confirmNewPassword'),'new-password');
   }
  }
  async function verify(){
   const input=form.elements.currentPassword;let password=input.value;
   input.value='';status.textContent='';verifying=true;controls();
   try{
    const result=await request('/api/account/reauthenticate',{ownerId:user.id,password},'POST',lifetime.signal);
    if(!alive())return;
    if(result?.ownerId!==user.id||!result.sessionContext)throw Error(label('unableToCheckAccount'));
    confirmedPassword=password;confirmedSession=result.sessionContext;gate=false;render();title.focus();
   }catch(error){
    if(alive())status.textContent=error.status===401?label('checkPassword'):!navigator.onLine?label('reconnectPassword'):error.message;
   }finally{password='';verifying=false;controls();}
  }
  const complete=async identity=>{if(!alive())return;remove();try{await onSaved(identity);}catch{/* The provider acknowledged the change. */}trigger?.focus();};
  function resetVerification(){
   if(kind==='name')return;
   forget();gate=true;render();
  }
  async function check(){
   if(!alive()||saving||!desired)return;
   saving=true;controls();status.textContent=label('checkingAccount');
   try{
    const account=await request('/api/account',null,'GET');if(!alive())return;
    if(!validIdentity(account,user.id))throw Error(label('unableToCheckAccount'));
    const matches=kind==='name'?account.name===desired:account.email.toLowerCase()===desired.toLowerCase();
    if(matches){saving=false;await complete(account);return;}
    uncertain=false;desired=null;checkButton.hidden=true;resetVerification();status.textContent=label('theChangeWasNotAppliedCheckYourDetailsAndSaveAgain');
   }catch{if(alive()){uncertain=true;status.textContent=label('unableToConfirmTheChangeCheckYourAccountBeforeTryingAgain');checkButton.hidden=false;}}
   finally{saving=false;controls();}
  }
  form.onsubmit=async event=>{
   event.preventDefault();if(saving||verifying||uncertain||!form.reportValidity())return;
   if(gate){await verify();return;}
   const values=Object.fromEntries(new FormData(form));
   if(kind==='name'&&onQueueName){
    const trimmed=values.name?.trim();
    if(!trimmed){status.textContent=label('enterName');return;}
    saving=true;controls();
    try{
     const queued=await onQueueName(trimmed);
     if(queued){saving=false;await complete(queued);return;}
    }catch(error){if(alive())status.textContent=error.message;return;}
    finally{saving=false;if(alive())controls();}
   }
   if(!navigator.onLine){status.textContent=label('reconnectEdit');return;}
   if(kind==='password'&&values.password!==values.confirmPassword){status.textContent=label('newPasswordsDoNotMatch');clearInputs();form.elements.password.focus();return;}
   let body={kind,name:values.name?.trim()};
   if(kind==='email'){email=values.email.trim();body={kind,email,password:confirmedPassword,confirmedSession};}
   if(kind==='password')body={kind,password:values.password,oldPassword:confirmedPassword,confirmedSession};
   forget();desired=kind==='password'?null:body[kind];saving=true;status.textContent=m('mobileNutrientDetail.saving');controls();clearInputs();let saved,unknown=false;
   try{const result=await request('/api/account/update',body);if(result?.ok!==true||!validIdentity(result.account,user.id))throw Error(label('theChangeCouldNotBeConfirmed'));saved=result.account;}
   catch(error){
    if(!alive())return;
    if(error.status>=400&&error.status<500&&error.status!==408){resetVerification();status.textContent=error.message;}
    else{unknown=true;uncertain=true;status.textContent=kind==='password'?label('passwordChangeNotConfirmedSignInWithYourNewPasswordOrResetIt'):label('checkingTheChange');if(kind==='password')recovery.hidden=false;}
   }finally{saving=false;controls();}
   if(saved)await complete(saved);else if(unknown&&kind!=='password')await check();
  };
  checkButton.onclick=check;cancel.onclick=close;current.oncancel=event=>{event.preventDefault();close();};
  current.onclick=event=>{if(event.target!==current)return;const rect=current.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();};
  render();root.append(current);current.showModal();title.focus();
 }
 return {open,dispose(){disposed=true;remove();}};
}
