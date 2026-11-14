let pending=null;
export const clearPending=()=>{pending=null;};
export async function request(path,body,signal){
 const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal,headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
 if(response.status===401){pending=null;document.querySelector('#page')?.replaceChildren();document.querySelector('#sheet-content')?.replaceChildren();location.replace('/login');throw Error('Please sign in.');}
 const result=await response.json().catch(()=>{throw Error('Unable to connect. Please try again.');});if(!response.ok)throw Object.assign(Error(result.error||'Unable to save. Try again.'),{status:response.status});return result;
}
export async function command(revision,type,payload){
 const signature=JSON.stringify({revision,type,payload});if(pending?.signature!==signature)pending={signature,body:{revision,type,payload,requestId:crypto.randomUUID()}};
 const result=await request('/api/diary/command',pending.body);pending=null;return result;
}
