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
applyAppLanguage(uiLanguage());
const root=document.querySelector('#app');
const params=new URLSearchParams(location.search);
const token={userId:params.get('userId'),secret:params.get('secret')};
if(location.search)history.replaceState(null,'',location.pathname);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,body,method='POST',signal){
  const response=await fetch(path,{method,signal,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})}).catch(error=>{if(error.name==='AbortError')throw error;throw Error(requestErrorMessage(null,503));});
  const result=await response.json().catch(()=>{throw Error(requestErrorMessage(null,503));});if(!response.ok)throw Object.assign(Error(requestErrorMessage(result,response.status)),{status:response.status,errorCode:result.errorCode});return result;
}
let editor=null;
let deletion=createAccountDeletion({root,request:api,onSignIn:()=>accountForm('login'),beforeDelete:()=>leaveOfflineAccount(root)});
const notice=()=>'<p id="notice" class="notice" role="status"></p>';
function message(text,error=false){const el=document.querySelector('#notice');if(el){el.textContent=text;el.classList.toggle('error',error);}}
async function busy(form,work){const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);message('');try{await work();}catch(error){message(error.message,true);}finally{buttons.forEach(b=>b.disabled=false);}}
const emailField=()=>`<label>${m("clients.email")}<input name="email" type="email" autocomplete="email" required maxlength="320"></label>`;
const passwordField=(label=m("accountCloud.password"),autocomplete='current-password')=>`<label>${label}<input name="password" type="password" minlength="8" maxlength="256" autocomplete="${autocomplete}" required></label>`;
function accountForm(mode){
  applyAppLanguage(resolveBrowserLanguage());
  const register=mode==='register',reset=mode==='reset-password',forgot=mode==='forgot-password';
  const title=register?m("accountCloud.createAccount"):reset?m("accountCloud.newPassword"):forgot?m("accountCloud.resetPassword"):m("accountCloud.signIn");
  root.innerHTML=`<h1>${title}</h1><form>${register?`<label>${m("settings.name")}<input name="name" autocomplete="name" required maxlength="128"></label>`:''}${reset?'':emailField()}${forgot?'':passwordField(reset?m("accountCloud.newPassword"):m("accountCloud.password"),register||reset?'new-password':'current-password')}<button type="submit">${forgot?m("accountCloud.sendResetLink"):reset?m("accountCloud.savePassword"):title}</button></form>${notice()}<nav class="links">${register||forgot||reset?`<a href="/login">${m("accountCloud.backToSignIn")}</a>`:`<a href="/register">${m("accountCloud.createAccount")}</a><a href="/forgot-password">${m("accountCloud.forgotPassword")}</a>`}</nav>`;
  const form=root.querySelector('form');form.onsubmit=event=>{event.preventDefault();busy(form,async()=>{
    const body=Object.fromEntries(new FormData(form));
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
  let user;try{user=knownUser?.id?knownUser:await api('/api/account',null,'GET');}catch(error){if(error.status===401){await lockCurrentOffline();if(!await deletion.recover())accountForm('login');return;}root.innerHTML=`<h1>${m("mobileMore.account")}</h1>${notice()}<button id="retry">${m("mobileSuggest.retry")}</button>`;message(error.message,true);root.querySelector('#retry').onclick=profile;return;}
  await rememberOfflineAccount(user);
  const display=await api('/api/display',null,'GET').catch(()=>null);if(display?.settings?.appLanguage)applyAppLanguage(display.settings.appLanguage);applyTheme(display?.settings?.theme);applyFontPreferences(display?.settings);
  const zone=user.profile.timeZone==='UTC'?Intl.DateTimeFormat().resolvedOptions().timeZone:user.profile.timeZone;
  root.innerHTML=`<h1>${m("mobileMore.account")}</h1>${installButton()}<section class="card account-identity"><button type="button" class="account-row" data-account-edit="name" aria-label="${m("accountCloud.editName")}"><span>${m("settings.name")}</span><span class="muted">${escape(user.name)}</span><span aria-hidden="true">&#8250;</span></button><button type="button" class="account-row" data-account-edit="email" aria-label="${m("accountCloud.changeEmail")}"><span>${m("clients.email")}</span><span class="muted">${escape(user.email)}</span><span aria-hidden="true">&#8250;</span></button><button type="button" class="account-row" data-account-edit="password" aria-label="${m("accountCloud.changePassword")}"><span>${m("accountCloud.password")}</span><span class="muted">&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</span><span aria-hidden="true">&#8250;</span></button><p class="account-verification">${user.emailVerified?m("accountCloud.emailVerified"):m("accountCloud.emailNotVerified")}</p>${user.emailVerified?'':`<button class="secondary" id="verify">${m("accountCloud.sendVerificationEmail")}</button>`}</section><form><label>${m("reminders.zone")}<input name="timeZone" value="${escape(zone)}" required maxlength="100"></label><label>${m("mobileWeightGoal.units")}<select name="units"><option value="metric">${m("accountCloud.metricUnits")}</option><option value="imperial">${m("accountCloud.imperial")}</option></select></label><button>${m("accountCloud.saveSettings")}</button></form>${notice()}<button class="secondary signout" id="signout">${m("accountCloud.signOut")}</button><button type="button" class="delete-account" id="delete-account">${m("accountCloud.deleteAccount")}</button>`;
  editor?.dispose();editor=createAccountEditor({root,request:api,onSaved:async identity=>{await profile({...user,...identity});message(m("accountCloud.saved"));}});
  for(const button of root.querySelectorAll('[data-account-edit]'))button.onclick=()=>editor.open(button.dataset.accountEdit,user,button);
  refreshInstallButton();
  const form=root.querySelector('form');form.elements.units.value=user.profile.units;
  const diaryLink=document.createElement('a');diaryLink.href='/diary';diaryLink.textContent='‹ '+m('accountCloud.backToDiary');diaryLink.className='links';root.prepend(diaryLink);
  form.onsubmit=e=>{e.preventDefault();busy(form,async()=>{await api('/api/profile',Object.fromEntries(new FormData(form)),'PUT');message(m("accountCloud.saved"));});};
  const verify=root.querySelector('#verify');if(verify)verify.onclick=()=>busy(verify.parentElement,async()=>{await api('/api/auth/verification',{});message(m("accountCloud.verificationEmailSent"));});
  root.querySelector('#delete-account').onclick=deletion.open;
  root.querySelector('#signout').onclick=()=>busy(root,async()=>{if(!await leaveOfflineAccount(root))return;await disconnectCurrentPush();await api('/api/auth/logout',{});user=null;root.replaceChildren();location.replace('/login');});
}
const mode=location.pathname.slice(1);
// Appwrite serves this static root before Astro's catch-all route.
if(['register','login','forgot-password','reset-password'].includes(mode))accountForm(mode);else if(mode==='verify-email')verification();else profile();

window.addEventListener('pagehide',()=>{deletion.dispose();editor?.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted&&(mode==='account'||mode==='')){deletion=createAccountDeletion({root,request:api,onSignIn:()=>accountForm('login'),beforeDelete:()=>leaveOfflineAccount(root)});profile();}});
