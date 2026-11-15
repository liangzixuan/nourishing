import {escape as e,iconButton,bottomNavigation} from './discover-ui.js';
import {formatMessage} from './message-format.js';
import {newsfeedMarkup} from './discover-settings-ui.js';
export function parseNewsfeed(value){
 if(value?.version!==1||!Array.isArray(value.items)||value.items.some(item=>!item||!['id','title','body'].every(key=>typeof item[key]==='string'&&item[key].trim()) )||new Set(value.items.map(item=>item.id)).size!==value.items.length)throw Error('The newsfeed could not load.');
 return value.items.map(({id,title,body})=>({id,title,body}));
}
export function newsCardsMarkup(items){return items.map(item=>`<article class="dc-card dc-news-card" data-news-id="${e(item.id)}"><h2>${e(item.title)}</h2><p>${e(item.body)}</p></article>`).join('');}

/** The feed can open from any Discover tab without loading dashboard reports. */
export class DiscoverNews {
 constructor({request,language='en',view,navigate,openAction}){
  Object.assign(this,{request,language,view,navigate,openAction});this.controller=new AbortController();this.focus=document.activeElement;this.text=key=>formatMessage(language,'discover.'+key);
  const dialog=this.dialog=document.createElement('dialog');dialog.className='dc-overlay';dialog.dataset.screen='newsfeed';dialog.setAttribute('aria-label',this.text('title.newsfeed'));
  dialog.innerHTML=`<header class="dc-dialog-header">${iconButton('arrow_back_ios_new',this.text('back'),'close')}<h2>${e(this.text('title.newsfeed'))}</h2><span></span></header><div class="dc-dialog-body" data-news-body></div><p class="dc-error" role="alert"></p><nav class="dc-bottom" aria-label="${e(this.text('nav.main'))}">${bottomNavigation(view,language)}</nav>`;
  dialog.addEventListener('cancel',event=>{event.preventDefault();this.back()});dialog.addEventListener('click',event=>{const button=event.target.closest('button');const action=button?.dataset.discover;if(action==='close')this.back();else if(action?.startsWith('shell-')){const id=action.slice(6);this.back();if(['more','add'].includes(id))this.openAction(id);else void this.navigate(id)}if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)this.back()}});
  document.body.append(dialog);dialog.showModal();void this.load();
 }
 async load(){try{const items=parseNewsfeed(await this.request('/newsfeed.json',{signal:this.controller.signal}));if(this.closed)return;this.dialog.querySelector('[data-news-body]').innerHTML=items.length?newsCardsMarkup(items):newsfeedMarkup(this.language)}catch(error){if(!this.closed)this.dialog.querySelector('[role=alert]').textContent=error.message}}
 back(){if(this.closed)return false;this.dispose();return true}
 dispose(){if(this.closed)return;this.closed=true;this.controller.abort();this.dialog.close();this.dialog.remove();if(this.focus?.isConnected)this.focus.focus({preventScroll:true})}
}
