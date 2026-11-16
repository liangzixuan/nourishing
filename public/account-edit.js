import {accountMessage as m} from './account-cloud-messages.js';
import {escape as esc} from './html.js';
const validIdentity=(value,id)=>value?.id===id&&typeof value.name==='string'&&typeof value.email==='string'&&typeof value.emailVerified==='boolean';
/** Credentials exist only in the open form and the request that consumes them. */
export function createAccountEditor({root,request,onSaved}){
 let dialog=null,disposed=false;
 const remove=()=>{if(!dialog)return;dialog.querySelector('form')?.reset();dialog.close();dialog.remove();dialog=null;};
 function open(kind,user,trigger){
  if(disposed||dialog||!['name','email','password'].includes(kind))return;
  const current=document.createElement('dialog');dialog=current;current.className='account-edit-dialog';current.setAttribute('aria-labelledby','account-edit-title');
  const password=(name,label,autocomplete)=>`<label>${label}<input name="${name}" type="password" autocomplete="${autocomplete}" minlength="8" maxlength="256" required></label>`;
  current.innerHTML=`<header><h2 id="account-edit-title">${kind==='name'?m("accountCloud.editName"):kind==='email'?m("accountCloud.changeEmail"):m("accountCloud.changePassword")}</h2><button type="button" class="account-edit-close" aria-label="${m("mobileNutrientDetail.close")}">&times;</button></header><section><form>${kind==='name'?`<label>${m("settings.name")}<input name="name" value="${esc(user.name)}" autocomplete="name" maxlength="128" required></label>`:kind==='email'?`<label>${m("clients.email")}<input name="email" type="email" value="${esc(user.email)}" autocomplete="email" maxlength="320" required></label>${password('password',m("accountCloud.currentPassword"),'current-password')}<p class="muted">${m("accountCloud.verifyYourNewEmailAfterSaving")}</p>`:`${password('oldPassword',m("accountCloud.currentPassword"),'current-password')}${password('password',m("accountCloud.newPassword"),'new-password')}${password('confirmPassword',m("accountCloud.confirmNewPassword"),'new-password')}`}<p class="notice" data-edit-status role="status"></p><div class="account-edit-actions"><button type="button" class="secondary" data-edit-cancel>${m("mobileWeightGoal.cancel")}</button><button type="submit">${m("mobileWeightGoal.save")}</button></div></form><button type="button" class="secondary" data-edit-check hidden>${m("accountCloud.checkAccount")}</button><nav class="links" data-edit-recovery hidden><a href="/login">${m("accountCloud.signIn")}</a><a href="/forgot-password">${m("accountCloud.resetPassword")}</a></nav></section>`;
  const form=current.querySelector('form'),status=current.querySelector('[data-edit-status]');let saving=false,uncertain=false,desired=null;
  const alive=()=>!disposed&&dialog===current;
  const close=()=>{if(saving)return;remove();trigger?.focus();};
  const controls=()=>{if(!alive())return;for(const element of form.elements)element.disabled=saving||uncertain;current.querySelector('.account-edit-close').disabled=saving;current.querySelector('[data-edit-cancel]').disabled=saving;current.querySelector('[data-edit-check]').disabled=saving;};
  const clearPasswords=()=>form.querySelectorAll('input[type=password]').forEach(input=>{input.value='';});
  const complete=async identity=>{if(!alive())return;remove();try{await onSaved(identity);}catch{/* The provider change is confirmed even if the parent refresh fails. */}trigger?.focus();};
  const check=async()=>{
   if(!alive()||saving||!desired)return;saving=true;controls();status.textContent=m("accountCloud.checkingAccount");
   try{const account=await request('/api/account',null,'GET');if(!alive())return;if(!validIdentity(account,user.id))throw Error(m("accountCloud.unableToCheckAccount"));const matches=kind==='name'?account.name===desired:account.email.toLowerCase()===desired.toLowerCase();if(matches){saving=false;await complete(account);return;}uncertain=false;desired=null;current.querySelector('[data-edit-check]').hidden=true;status.textContent=m("accountCloud.theChangeWasNotAppliedCheckYourDetailsAndSaveAgain");}
   catch{if(alive()){uncertain=true;status.textContent=m("accountCloud.unableToConfirmTheChangeCheckYourAccountBeforeTryingAgain");current.querySelector('[data-edit-check]').hidden=false;}}
   finally{saving=false;controls();}
  };
  form.onsubmit=async event=>{
   event.preventDefault();if(saving||uncertain||!form.reportValidity())return;const values=Object.fromEntries(new FormData(form));
   if(kind==='password'&&values.password!==values.confirmPassword){status.textContent=m("accountCloud.newPasswordsDoNotMatch");clearPasswords();return;}
   const body=kind==='name'?{kind,name:values.name.trim()}:kind==='email'?{kind,email:values.email.trim(),password:values.password}:{kind,password:values.password,oldPassword:values.oldPassword};
   desired=kind==='password'?null:body[kind];saving=true;status.textContent=m("mobileNutrientDetail.saving");controls();clearPasswords();let saved,unknown=false;
   try{const result=await request('/api/account/update',body);if(result?.ok!==true||!validIdentity(result.account,user.id))throw Error(m("accountCloud.theChangeCouldNotBeConfirmed"));saved=result.account;}
   catch(error){if(!alive())return;if(error.status>=400&&error.status<500&&error.status!==408)status.textContent=error.message;else{unknown=true;uncertain=true;status.textContent=kind==='password'?m("accountCloud.passwordChangeNotConfirmedSignInWithYourNewPasswordOrResetIt"):m("accountCloud.checkingTheChange");if(kind==='password')current.querySelector('[data-edit-recovery]').hidden=false;}}
   finally{saving=false;controls();}
   if(saved)await complete(saved);else if(unknown&&kind!=='password')await check();
  };
  current.querySelector('[data-edit-check]').onclick=check;current.querySelector('.account-edit-close').onclick=close;current.querySelector('[data-edit-cancel]').onclick=close;current.oncancel=event=>{event.preventDefault();close();};current.onclick=event=>{if(event.target!==current)return;const rect=current.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();};root.append(current);current.showModal();form.querySelector('input').focus();
 }
 return {open,dispose(){disposed=true;remove();}};
}
