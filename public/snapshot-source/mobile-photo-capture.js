import {formatMessage} from './message-format.js';
import {cameraTorchEnabled,supportsCameraTorch} from '../camera-torch.js';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stopTracks=stream=>{for(const track of stream?.getTracks()||[])track.stop()};

// Owns the camera only. FoodLogReview owns file validation, recognition and saving.
export class MobilePhotoCapture {
  constructor({dialog,language='en',onFile,onClose,title,showHint=true,fileName='meal-photo.jpg',closeLabel,onNativeCamera,flashLabel,flashError}) {
    Object.assign(this,{dialog,onFile,onClose,fileName,onNativeCamera,flashError});
    this.message=key=>formatMessage(language,'mobilePhoto.'+key);
    this.generation=0;this.stream=null;this.disposed=false;this.busy=false;
    this.events=new AbortController();const {signal}=this.events;
    this.root=document.createElement('section');this.root.className='mobile-photo-capture';
    const icon=name=>`<img src="/snapshot-source/${name}.svg" alt="">`;
    this.root.innerHTML=`<header class="mpc-header"><button type="button" data-mpc="cancel" aria-label="${escape(this.message('cancel'))}"><img src="/snapshot-source/close.svg" alt=""></button><h2>${escape(title??this.message('title'))}</h2></header><aside class="mpc-hint" ${showHint?'':'hidden'}><span>${escape(this.message('hint'))}</span><button type="button" data-mpc="dismiss" aria-label="${escape(this.message('dismiss'))}"><img src="/snapshot-source/close.svg" alt=""></button></aside><div class="mpc-stage"><video autoplay muted playsinline aria-label="${escape(this.message('preview'))}"></video><div class="mpc-feedback"><p role="status" data-mpc-status></p><button type="button" data-mpc="retry" hidden>${escape(this.message('retry'))}</button></div></div><footer class="mpc-controls"><button type="button" data-mpc="gallery" aria-label="${escape(this.message('gallery'))}">${icon('image-multiple')}</button><button type="button" data-mpc="shutter" aria-label="${escape(this.message('capture'))}" disabled>${icon('circle')}</button><button type="button" data-mpc="cancel">${escape(this.message('cancel'))}</button><input type="file" data-mpc-file accept="image/jpeg,image/png,image/webp" hidden></footer>`;
    this.video=this.root.querySelector('video');this.status=this.root.querySelector('[data-mpc-status]');this.retry=this.root.querySelector('[data-mpc=retry]');this.shutter=this.root.querySelector('[data-mpc=shutter]');this.file=this.root.querySelector('[data-mpc-file]');
    if(closeLabel)this.root.querySelector('.mpc-header [data-mpc=cancel]').setAttribute('aria-label',closeLabel);
    if(onNativeCamera)this.video.setAttribute('aria-description',this.message('hint'));
    if(flashLabel){
      this.flash=document.createElement('button');this.flash.type='button';this.flash.dataset.mpc='flash';
      this.flash.setAttribute('aria-label',flashLabel);this.video.after(this.flash);
    }
    this.previousFocus=document.activeElement;
    this.hiddenSiblings=[...dialog.children].map(element=>({element,inert:element.inert}));
    for(const {element} of this.hiddenSiblings)element.inert=true;
    dialog.classList.add('mobile-photo-dialog');dialog.append(this.root);
    this.root.addEventListener('click',event=>{
      const action=event.target.closest('[data-mpc]')?.dataset.mpc;
      if(!action)return;event.preventDefault();
      if(action==='cancel')this.onClose();
      if(action==='dismiss')this.root.querySelector('.mpc-hint').hidden=true;
      if(action==='retry')void this.start();
      if(action==='flash')void this.toggleFlash();
      if(action==='shutter'){if(!this.stream&&this.onNativeCamera)this.onNativeCamera();else void this.capture();}
      if(action==='gallery'){this.stop();this.show('paused',true);this.file.value='';this.file.click()}
    },{signal});
    this.file.addEventListener('change',()=>{const file=this.file.files?.[0];if(file)this.deliver(file)},{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.stop();this.show('paused',true)}},{signal});
    window.addEventListener('pagehide',()=>{this.stop();this.show('paused',true)},{signal});
    dialog.addEventListener('close',()=>{if(!dialog.open)this.dispose();},{signal});
    this.root.querySelector('button').focus();void this.start();
  }
  show(key,retry=false){if(this.disposed)return;this.status.textContent=key?this.message(key):'';this.retry.hidden=!retry;this.root.querySelector('.mpc-feedback').hidden=!key;if(this.onNativeCamera&&!this.stream)this.shutter.disabled=!retry;}
  updateFlash(){
    if(!this.flash)return;
    const track=this.stream?.getVideoTracks()[0];
    this.flash.disabled=this.changingFlash||!supportsCameraTorch(track);
    this.flash.setAttribute('aria-pressed',String(cameraTorchEnabled(track)));
  }
  async toggleFlash(){
    const track=this.stream?.getVideoTracks()[0],generation=this.generation;
    if(this.changingFlash||!supportsCameraTorch(track))return;
    const enabled=!cameraTorchEnabled(track);this.changingFlash=true;this.updateFlash();
    try{
      await track.applyConstraints({advanced:[{torch:enabled}]});
      if(generation!==this.generation)return;
      if(cameraTorchEnabled(track)!==enabled)throw Error();
      this.show('');
    }catch{
      if(generation===this.generation){this.status.textContent=this.flashError;this.root.querySelector('.mpc-feedback').hidden=false;}
    }finally{
      if(generation===this.generation){this.changingFlash=false;this.updateFlash();}
    }
  }
  stop(){this.generation++;stopTracks(this.stream);this.stream=null;this.video.pause();this.video.srcObject=null;this.shutter.disabled=true;this.busy=false;this.changingFlash=false;this.updateFlash();}
  async start(){
    if(this.disposed)return;this.stop();const generation=this.generation;this.show('opening');
    try{
      if(!navigator.mediaDevices?.getUserMedia){this.show('unavailable',true);return}
      const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
      if(this.disposed||generation!==this.generation){stopTracks(stream);return}
      this.stream=stream;this.video.srcObject=stream;
      for(const track of stream.getVideoTracks())track.addEventListener('ended',()=>{if(this.stream===stream){this.stop();this.show('paused',true)}},{signal:this.events.signal});
      await this.video.play();
      if(this.disposed||generation!==this.generation)return;
      this.shutter.disabled=false;this.updateFlash();this.show('');
    }catch(error){
      if(this.disposed||generation!==this.generation)return;
      this.stop();this.show(['NotAllowedError','SecurityError'].includes(error?.name)?'denied':error?.name==='NotFoundError'?'noCamera':'unavailable',true);
    }
  }
  async capture(){
    if(this.disposed||this.busy||!this.stream)return;
    const {videoWidth:width,videoHeight:height}=this.video;
    if(!width||!height){this.show('opening');return}
    this.busy=true;this.shutter.disabled=true;const generation=this.generation;
    try{
      const canvas=document.createElement('canvas'),scale=Math.min(1,1920/Math.max(width,height));
      canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
      canvas.getContext('2d').drawImage(this.video,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));
      if(this.disposed||generation!==this.generation)return;
      if(!blob)throw Error('No image');
      this.deliver(new File([blob],this.fileName,{type:'image/jpeg'}));
    }catch{
      if(this.disposed||generation!==this.generation)return;
      this.busy=false;this.shutter.disabled=false;this.show('captureFailed');
    }
  }
  deliver(file){if(this.disposed)return;const receive=this.onFile;this.dispose();receive(file)}
  dispose(){if(this.disposed)return;this.disposed=true;this.events.abort();this.stop();this.root.remove();this.dialog.classList.remove('mobile-photo-dialog');for(const {element,inert} of this.hiddenSiblings)element.inert=inert;if(this.previousFocus?.isConnected)this.previousFocus.focus()}
}
