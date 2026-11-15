const root=document.querySelector('#app');
import {widgetDestination,widgetQuery} from './widget-link.js';
const params=new URLSearchParams(location.search);
const widget=widgetDestination(location.search);
const token={userId:params.get('userId'),secret:params.get('secret')};
if(location.search)history.replaceState(null,'',location.pathname+widgetQuery(widget));
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,body,method='POST'){
  const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error??'Please try again.'),{status:response.status});return result;
}
const notice=()=>'<p id="notice" class="notice" role="status"></p>';
function message(text,error=false){const el=document.querySelector('#notice');if(el){el.textContent=text;el.classList.toggle('error',error);}}
async function busy(form,work){const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);message('');try{await work();}catch(error){message(error.message,true);}finally{buttons.forEach(b=>b.disabled=false);}}
const emailField='<label>Email<input name="email" type="email" autocomplete="email" required maxlength="320"></label>';
const passwordField=(label='Password',autocomplete='current-password')=>`<label>${label}<input name="password" type="password" minlength="8" maxlength="256" autocomplete="${autocomplete}" required></label>`;
function accountForm(mode){
  const register=mode==='register',reset=mode==='reset-password',forgot=mode==='forgot-password';
  const title=register?'Create account':reset?'New password':forgot?'Reset password':'Sign in';
  root.innerHTML=`<h1>${title}</h1><form>${register?'<label>Name<input name="name" autocomplete="name" required maxlength="128"></label>':''}${reset?'':emailField}${forgot?'':passwordField(reset?'New password':'Password',register||reset?'new-password':'current-password')}<button type="submit">${forgot?'Send reset link':reset?'Save password':title}</button></form>${notice()}<nav class="links">${register||forgot||reset?'<a href="/login">Back to sign in</a>':'<a href="/register">Create account</a><a href="/forgot-password">Forgot password?</a>'}</nav>`;
  const form=root.querySelector('form');form.onsubmit=event=>{event.preventDefault();busy(form,async()=>{
    const body=Object.fromEntries(new FormData(form));
    if(reset){if(!token.userId||!token.secret)throw Error('Open the reset link from your email.');await api('/api/auth/reset',{...token,password:body.password});token.secret=null;form.reset();message('Password updated. You can sign in.');return;}
    if(forgot){await api('/api/auth/recovery',body);message('If an account exists, a reset link is on its way.');return;}
    await api(`/api/auth/${register?'register':'login'}`,body);form.reset();location.replace((register?'/account':'/diary')+widgetQuery(widget));
  });};
}
function verification(){
  root.innerHTML=`<h1>Verify email</h1><form><button>Verify email</button></form>${notice()}<a href="/account">Continue to account</a>`;
  const form=root.querySelector('form');form.onsubmit=e=>{e.preventDefault();busy(form,async()=>{if(!token.userId||!token.secret)throw Error('Open the verification link from your email.');await api('/api/auth/verify',token);token.secret=null;form.hidden=true;message('Email verified.');});};
}
async function profile(){
  let user;try{user=await api('/api/account',null,'GET');}catch(error){if(error.status===401){accountForm('login');return;}root.innerHTML=`<h1>Account</h1>${notice()}<button id="retry">Try again</button>`;message(error.message,true);root.querySelector('#retry').onclick=profile;return;}
  const zone=user.profile.timeZone==='UTC'?Intl.DateTimeFormat().resolvedOptions().timeZone:user.profile.timeZone;
  root.innerHTML=`<h1>Account</h1><section class="card"><p><strong>${escape(user.name)}</strong></p><p class="muted">${escape(user.email)}</p><p>${user.emailVerified?'Email verified':'Email not verified'}</p>${user.emailVerified?'':'<button class="secondary" id="verify">Send verification email</button>'}</section><form><label>Time zone<input name="timeZone" value="${escape(zone)}" required maxlength="100"></label><label>Units<select name="units"><option value="metric">Metric</option><option value="imperial">Imperial</option></select></label><button>Save settings</button></form>${notice()}<button class="secondary signout" id="signout">Sign out</button>`;
  const form=root.querySelector('form');form.elements.units.value=user.profile.units;
  const diaryLink=document.createElement('a');diaryLink.href='/diary'+widgetQuery(widget);diaryLink.textContent='Open diary';diaryLink.className='links';root.prepend(diaryLink);
  form.onsubmit=e=>{e.preventDefault();busy(form,async()=>{await api('/api/profile',Object.fromEntries(new FormData(form)),'PUT');message('Saved.');});};
  const verify=root.querySelector('#verify');if(verify)verify.onclick=()=>busy(verify.parentElement,async()=>{await api('/api/auth/verification',{});message('Verification email sent.');});
  root.querySelector('#signout').onclick=()=>busy(root,async()=>{await api('/api/auth/logout',{});user=null;root.replaceChildren();location.replace('/login');});
}
const mode=location.pathname.slice(1);
// Appwrite serves this static root before Astro's catch-all route.
if(mode===''&&widget)location.replace('/diary'+widgetQuery(widget));else if(['register','login','forgot-password','reset-password'].includes(mode))accountForm(mode);else if(mode==='verify-email')verification();else profile();
