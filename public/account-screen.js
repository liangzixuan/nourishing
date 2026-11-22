import {coreText} from './core-cloud-messages.js';
import {moreIcon,moreRow} from './more-source/menu-view.js';
import {accountDisplay,accountDisplayKey,cacheAccountDisplay} from './account-display.js';
import {cachedRead} from './device-requests.js';
import {request as diaryRequest} from './diary-api.js';
import {readDeviceCache,invalidateDeviceCache} from './device-cache.js';
import {applyAppLanguage,uiLanguage,resolveBrowserLanguage} from './app-language.js';
import {requestErrorMessage} from './request-error.js';
import {accountMessage as m} from './account-cloud-messages.js';
import {applyFontPreferences} from './font-presentation.js';
import {createAccountEditor} from './account-edit.js';
import {applyTheme} from './appearance.js';
import {rememberOfflineAccount,lockCurrentOffline,leaveOfflineAccount} from './offline-session.js';
import {disconnectCurrentPush} from './reminders.js';
import {installButton,refreshInstallButton} from './pwa.js';
import {createAccountDeletion} from './account-deletion.js';
import {mountBulkDiaryDeletion} from './account-diary-deletion.js';
export function mountAccount({root,embedded=false,section,onIdentity=()=>{}}){
let disposed=false,profileSerial=0;const lifetime=new AbortController();
const alive=()=>!disposed&&root.isConnected;
root.classList.add('account-surface');
applyAppLanguage(uiLanguage());
const params=new URLSearchParams(embedded?'':location.search);
const token={userId:params.get('userId'),secret:params.get('secret')};
if(!embedded&&location.search)history.replaceState(null,'',location.pathname);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,body,method='POST',signal){
 const ticket=method!=='GET'&&path!=='/api/account/reauthenticate'?(await readDeviceCache('/api/diary').catch(()=>({}))).ticket:null;
 if(ticket)await invalidateDeviceCache(ticket).catch(()=>{});
 try{return await accountNetwork(path,body,method,signal);}finally{if(ticket)await invalidateDeviceCache(ticket).catch(()=>{});}
}
async function accountNetwork(path,body,method,signal){
  const response=await fetch(path,{method,signal:signal??lifetime.signal,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})}).catch(error=>{if(error.name==='AbortError')throw error;throw Error(requestErrorMessage(null,503));});
  const result=await response.json().catch(()=>{throw Error(requestErrorMessage(null,503));});if(!response.ok)throw Object.assign(Error(requestErrorMessage(result,response.status)),{status:response.status,errorCode:result.errorCode});return result;
}
let editor=null,bulk=null;
let deletion=createAccountDeletion({root,request:api,onSignIn:()=>accountForm('login'),beforeDelete:()=>leaveOfflineAccount(root)});
const notice=()=>'<p id="notice" class="notice" role="status"></p>';
function message(text,error=false){const el=root.querySelector('#notice');if(el){el.textContent=text;el.classList.toggle('error',error);}}
async function busy(form,work){const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);message('');try{await work();}catch(error){message(error.message,true);}finally{buttons.forEach(b=>b.disabled=false);}}
const emailField=()=>`<label>${m("clients.email")}<input name="email" type="email" autocomplete="email" required maxlength="320"></label>`;
const passwordField=(label=m("accountCloud.password"),autocomplete='current-password',name='password')=>`<label>${label}<input name="${name}" type="password" minlength="8" maxlength="256" autocomplete="${autocomplete}" required></label>`;
function accountForm(mode){
  applyAppLanguage(resolveBrowserLanguage());
  const register=mode==='register',reset=mode==='reset-password',forgot=mode==='forgot-password';
  const title=register?m("accountCloud.createAccount"):reset?m("accountCloud.newPassword"):forgot?m("accountCloud.resetPassword"):m("accountCloud.signIn");
  root.innerHTML=`<h1>${title}</h1><form>${register?`<label>${m("settings.name")}<input name="name" autocomplete="name" required maxlength="128"></label>`:''}${reset?'':emailField()}${forgot?'':passwordField(reset?m("accountCloud.newPassword"):m("accountCloud.password"),register||reset?'new-password':'current-password')}${register?passwordField(m('accountCloud.confirmPassword'),'new-password','confirmPassword'):''}<button type="submit">${forgot?m("accountCloud.sendResetLink"):reset?m("accountCloud.savePassword"):title}</button></form>${notice()}<nav class="links">${register||forgot||reset?`<a href="/login">${m("accountCloud.backToSignIn")}</a>`:`<a href="/register">${m("accountCloud.createAccount")}</a><a href="/forgot-password">${m("accountCloud.forgotPassword")}</a>`}</nav>`;
  const form=root.querySelector('form');form.onsubmit=event=>{event.preventDefault();busy(form,async()=>{
    const body=Object.fromEntries(new FormData(form));
    if(register){if(body.password!==body.confirmPassword){message(m('accountCloud.passwordsDoNotMatch'),true);form.elements.confirmPassword.focus();return;}delete body.confirmPassword;}
    if(reset){if(!token.userId||!token.secret)throw Error(m("accountCloud.openTheResetLinkFromYourEmail"));await api('/api/auth/reset',{...token,password:body.password});token.secret=null;form.reset();message(m("accountCloud.passwordUpdatedYouCanSignIn"));return;}
    if(forgot){await api('/api/auth/recovery',body);message(m('accountCloud.recoverySent'));return;}
    await api(`/api/auth/${register?'register':'login'}`,body);await rememberOfflineAccount(await api('/api/account',null,'GET'));form.reset();location.replace((register?'/account':'/diary'));
  });};
}
function verification(){
  root.innerHTML=`<h1>${m("accountCloud.verifyEmail")}</h1><form><button>${m("accountCloud.verifyEmail")}</button></form>${notice()}<a href="/account">${m("accountCloud.continueToAccount")}</a>`;
  const form=root.querySelector('form');form.onsubmit=e=>{e.preventDefault();busy(form,async()=>{if(!token.userId||!token.secret)throw Error(m("accountCloud.openTheVerificationLinkFromYourEmail"));await api('/api/auth/verify',token);token.secret=null;form.hidden=true;message(m("accountCloud.emailVerifiedStatus"));});};
}
async function profile(knownUser=null){
  const serial=++profileSerial;
  let user;try{user=knownUser?.id?knownUser:embedded?await cachedRead(accountDisplayKey,async signal=>{
    const value=await api('/api/account',null,'GET',signal);
    const {ticket}=await readDeviceCache(accountDisplayKey);
    if(ticket&&ticket.ownerId!==value.id)throw new DOMException('Account changed.','AbortError');
    return accountDisplay(value);
  },lifetime.signal,{onRefresh:value=>{if(alive()&&!bulk&&serial===profileSerial&&!root.querySelector('dialog[open]')&&!root.querySelector('form:focus-within'))void profile(value);}}):await api('/api/account',null,'GET');}catch(error){if(!alive()||serial!==profileSerial)return;if(error.status===401){await lockCurrentOffline();if(!await deletion.recover())accountForm('login');return;}root.innerHTML=`<h1>${m("mobileMore.account")}</h1>${notice()}<button id="retry">${m("mobileSuggest.retry")}</button>`;message(error.message,true);root.querySelector('#retry').onclick=profile;return;}
  if(!alive()||serial!==profileSerial)return;
  if(!embedded)await rememberOfflineAccount(user);
  else if(knownUser){const {ticket}=await readDeviceCache(accountDisplayKey);await cacheAccountDisplay(user,ticket);}
  if(!alive()||serial!==profileSerial)return;
  onIdentity(accountDisplay(user));
  const display=await (embedded?diaryRequest('/api/display',undefined,lifetime.signal):api('/api/display',null,'GET')).catch(()=>null);if(!alive()||serial!==profileSerial)return;if(display?.settings?.appLanguage)applyAppLanguage(display.settings.appLanguage);applyTheme(display?.settings?.theme);applyFontPreferences(display?.settings);
  if(section==='account-data'){
   root.innerHTML=`<section class="mm-group account-data-menu">${moreRow('bulk-delete',m('accountCloud.bulk.title'))}<button type="button" class="mm-row" id="delete-account"><span>${m('accountCloud.bulk.account')}</span>${moreIcon('chevron-right','mm-chevron')}</button></section><p class="account-data-note">${m('accountCloud.bulk.accountNote')}</p>`;
   root.querySelector('#delete-account').onclick=deletion.open;
   return;
  }
  if(section==='bulk-delete'){
   bulk?.dispose();
   bulk=mountBulkDiaryDeletion({root,ownerId:user.id,timeZone:user.profile.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone,request:accountNetwork});
   return;
  }
  const zone=user.profile.timeZone==='UTC'?Intl.DateTimeFormat().resolvedOptions().timeZone:user.profile.timeZone;
  root.innerHTML=`${embedded?'':`<h1>${m("mobileMore.account")}</h1>`}${installButton()}<section class="card account-identity"><button type="button" class="account-row" data-account-edit="name" aria-label="${m("accountCloud.editName")}"><span>${m("settings.name")}</span><span class="muted">${escape(user.name)}</span><span aria-hidden="true">&#8250;</span></button><button type="button" class="account-row" data-account-edit="email" aria-label="${m("accountCloud.changeEmail")}"><span>${m("clients.email")}</span><span class="muted">${escape(user.email)}</span><span aria-hidden="true">&#8250;</span></button><button type="button" class="account-row" data-account-edit="password" aria-label="${m("accountCloud.changePassword")}"><span>${m("accountCloud.password")}</span><span class="muted">&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</span><span aria-hidden="true">&#8250;</span></button><p class="account-verification">${user.emailVerified?m("accountCloud.emailVerified"):m("accountCloud.emailNotVerified")}</p>${user.emailVerified?'':`<button class="secondary" id="verify">${m("accountCloud.sendVerificationEmail")}</button>`}</section>${section==='account'?`<section class="mm-group">${moreRow('account-data',coreText('more.accountData'))}${moreRow('notifications',coreText('more.notifications'))}</section>`: ''}<form><label>${m("reminders.zone")}<input name="timeZone" value="${escape(zone)}" required maxlength="100"></label><label>${m("mobileWeightGoal.units")}<select name="units"><option value="metric">${m("accountCloud.metricUnits")}</option><option value="imperial">${m("accountCloud.imperial")}</option></select></label><button>${m("accountCloud.saveSettings")}</button></form>${notice()}<button class="secondary signout" id="signout">${m("accountCloud.signOut")}</button>${section==='account'?'':`<button type="button" class="delete-account" id="delete-account">${m("accountCloud.deleteAccount")}</button>`}`;
  editor?.dispose();editor=createAccountEditor({root,request:api,onSaved:async identity=>{await profile({...user,...identity});message(m("accountCloud.saved"));}});
  for(const button of root.querySelectorAll('[data-account-edit]'))button.onclick=()=>editor.open(button.dataset.accountEdit,user,button);
  refreshInstallButton();
  const form=root.querySelector('form');form.elements.units.value=user.profile.units;
  if(!embedded){const diaryLink=document.createElement('a');diaryLink.href='/diary';diaryLink.textContent='‹ '+m('accountCloud.backToDiary');diaryLink.className='links';root.prepend(diaryLink);}
  form.onsubmit=e=>{e.preventDefault();busy(form,async()=>{await api('/api/profile',Object.fromEntries(new FormData(form)),'PUT');message(m("accountCloud.saved"));});};
  const verify=root.querySelector('#verify');if(verify)verify.onclick=()=>busy(verify.parentElement,async()=>{await api('/api/auth/verification',{});message(m("accountCloud.verificationEmailSent"));});
  root.querySelector('#delete-account')?.addEventListener('click',deletion.open);
  root.querySelector('#signout').onclick=()=>busy(root,async()=>{if(!await leaveOfflineAccount(root))return;await disconnectCurrentPush();await api('/api/auth/logout',{});user=null;root.replaceChildren();location.replace('/login');});
}
const mode=embedded?'account':location.pathname.slice(1);
// Appwrite serves this static root before Astro's catch-all route.
if(['register','login','forgot-password','reset-password'].includes(mode))accountForm(mode);else if(mode==='verify-email')verification();else profile();

window.addEventListener('pagehide',()=>{deletion.dispose();editor?.dispose();bulk?.dispose();bulk=null;},{signal:lifetime.signal});
window.addEventListener('pageshow',event=>{if(event.persisted&&(mode==='account'||mode==='')){deletion=createAccountDeletion({root,request:api,onSignIn:()=>accountForm('login'),beforeDelete:()=>leaveOfflineAccount(root)});profile();}},{signal:lifetime.signal});
return {back(){const dialog=root.querySelector('dialog[open]');if(dialog){dialog.dispatchEvent(new Event('cancel',{cancelable:true}));return true;}return false;},dispose(){disposed=true;profileSerial++;lifetime.abort();deletion.dispose();editor?.dispose();bulk?.dispose();bulk=null;root.replaceChildren();root.classList.remove('account-surface');}};
}
