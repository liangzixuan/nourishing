import {formatMessage} from './message-format.js';
import {supportsCameraTorch,cameraTorchEnabled} from '../camera-torch.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const MAX_BARCODE_IMAGE_BYTES=8*1024*1024;
const ZXING_VERSION='3.1.6';
export const BARCODE_DECODER=`zxing-wasm ${ZXING_VERSION}`;
const vendorRoot=`/vendor/zxing/${ZXING_VERSION}`;
const lengths={EAN8:8,EAN13:13,UPCA:12,ITF14:14,ITF:14};
const formats=['EAN8','EAN13','UPCA','UPCE','ITF14'];

export function validGtin(code){
  if(typeof code!=='string'||!/^(?:\d{8}|\d{12,14})$/.test(code))return false;
  let sum=0,weight=3;
  for(let index=code.length-2;index>=0;index--){sum+=Number(code[index])*weight;weight=weight===3?1:3;}
  return (10-sum%10)%10===Number(code.at(-1));
}

export function retailCandidates(results){
  const candidates=[],unsupported=[],seen=new Set();
  for(const result of Array.isArray(results)?results:[]){
    if(!result||result.error||result.isValid!==true||typeof result.text!=='string')continue;
    const {text:code,format}=result;
    if(format==='UPCE'){
      let rawCode;try{rawCode=JSON.parse(result.extra).UPCE;}catch{}
      if(/^[01]\d{7}$/.test(rawCode||'')&&/^\d{12,13}$/.test(code)&&validGtin(code)){
        if(!seen.has(code)){seen.add(code);candidates.push({code,format,rawCode});}
      }else unsupported.push({code,format,messageCode:'compressedUnsupported',message:'This compressed UPC-E could not be linked to a full identifier. Enter the package’s full UPC number; it cannot be looked up as EAN-8.'});
      continue;
    }
    if(lengths[format]!==code.length||!validGtin(code)||seen.has(code))continue;
    seen.add(code);candidates.push({code,format});
  }
  return {candidates,unsupported};
}

let readerPromise;
async function localReader(){
  if(!readerPromise)readerPromise=import(`${vendorRoot}/reader/index.js`).then(reader=>{
    reader.prepareZXingModule({overrides:{locateFile:path=>path.endsWith('.wasm')?`${vendorRoot}/reader.wasm`:path}});
    return reader;
  }).catch(error=>{readerPromise=null;throw error;});
  return readerPromise;
}

export async function decodeRetailImage(image,{reader}={}){
  try{
    const decoder=reader||await localReader();
    const results=await decoder.readBarcodes(image,{formats,tryHarder:true,tryRotate:true,tryInvert:true,textMode:'Plain',maxNumberOfSymbols:8,eanAddOnSymbol:'Ignore'});
    return retailCandidates(results);
  }catch(error){
    if(reader)throw error;
    readerPromise=null;
    throw Object.assign(Error('The local barcode decoder could not run. Check the connection to Nourishing, then try again or enter the barcode number.',{cause:error}),{barcodeCode:'decoderUnavailable'});
  }
}

function stopTracks(stream){for(const track of stream?.getTracks?.()||[])track.stop();}
export class BarcodeCameraSession{
  constructor({getUserMedia,attach,decode,onResult,onStatus,onError,schedule=(work,delay)=>setTimeout(work,delay),cancel=timer=>clearTimeout(timer)}){
    Object.assign(this,{getUserMedia,attach,decode,onResult,onStatus,onError,schedule,cancel});
    this.generation=0;this.stream=null;this.timer=null;this.running=false;this.pending=false;this.disposed=false;
  }
  async start(){
    if(this.disposed)return;
    this.stop();const generation=this.generation;this.pending=true;this.onStatus('waiting');
    try{
      const stream=await this.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
      if(this.disposed||generation!==this.generation){stopTracks(stream);return;}
      this.stream=stream;await this.attach(stream);
      if(this.disposed||generation!==this.generation)return;
      this.pending=false;this.running=true;this.onStatus('pointCamera');
      this.timer=this.schedule(()=>this.frame(generation),0);
    }catch(error){
      if(this.disposed||generation!==this.generation)return;
      this.stop();this.onError(error);
    }
  }
  async frame(generation){
    this.timer=null;
    if(this.disposed||!this.running||generation!==this.generation)return;
    try{
      const result=await this.decode();
      if(this.disposed||!this.running||generation!==this.generation)return;
      if(result.candidates.length||result.unsupported.length){this.stop();this.onResult(result);return;}
    }catch(error){if(this.disposed||generation!==this.generation)return;this.stop();this.onError(error);return;}
    this.timer=this.schedule(()=>this.frame(generation),300);
  }
  stop(){
    this.generation++;if(this.timer!==null)this.cancel(this.timer);this.timer=null;
    stopTracks(this.stream);this.stream=null;this.pending=false;this.running=false;
  }
  torchSupported(){
    if(!this.running)return false;
    return supportsCameraTorch(this.stream?.getVideoTracks?.()[0]);
  }
  torchEnabled(){return this.running&&cameraTorchEnabled(this.stream?.getVideoTracks?.()[0]);}
  async setTorch(enabled){
    if(!this.torchSupported())return false;
    const generation=this.generation,track=this.stream.getVideoTracks()[0];
    try{await track.applyConstraints({advanced:[{torch:enabled}]});}catch(error){if(this.disposed||generation!==this.generation)return false;throw error;}
    return !this.disposed&&generation===this.generation&&this.torchEnabled();
  }
  dispose(){this.stop();this.disposed=true;}
}

export class BarcodeScanner{
  constructor({root,onCode,decode=decodeRetailImage,language='en',fullscreen=false,onClose=()=>{}}){
    this.message=(key,values)=>formatMessage(language,'barcode.'+key,values);
    this.root=root;this.onCode=onCode;this.decode=decode;this.disposed=false;this.busy=false;this.lookupPending=false;this.imageGeneration=0;this.candidates=[];
    root.innerHTML=`<section class="barcode-scanner" aria-label="${escape(this.message('scanLabel'))}"><p class="mini-note">${escape(this.message('privacy'))}</p><div class="barcode-scanner-controls"><button type="button" class="btn green" data-barcode-action="camera">${escape(this.message('start'))}</button><button type="button" class="btn" data-barcode-action="stop" disabled>${escape(this.message('stop'))}</button><label class="btn barcode-file-label">${escape(this.message('image'))}<input type="file" data-barcode-file accept="image/jpeg,image/png,image/webp"></label></div><video class="barcode-video" playsinline muted hidden aria-label="${escape(this.message('preview'))}"></video><p class="mini-note barcode-status" role="status" aria-live="polite"></p><div class="barcode-error dialog-error" role="alert" hidden></div><div class="barcode-results"></div><p class="mini-note">${escape(this.message('fileHelp'))}</p></section>`;
    this.video=root.querySelector('video');this.status=root.querySelector('.barcode-status');this.error=root.querySelector('.barcode-error');
    this.camera=new BarcodeCameraSession({
      getUserMedia:constraints=>{if(!globalThis.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error(this.message('secureCamera'));return navigator.mediaDevices.getUserMedia(constraints);},
      attach:async stream=>{this.video.srcObject=stream;this.video.hidden=false;await this.video.play();},
      decode:async()=>{
        if(this.manualOpen||!this.video.videoWidth||!this.video.videoHeight)return {candidates:[],unsupported:[]};
        const scale=Math.min(1,1600/Math.max(this.video.videoWidth,this.video.videoHeight));
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(this.video.videoWidth*scale));canvas.height=Math.max(1,Math.round(this.video.videoHeight*scale));
        const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(this.video,0,0,canvas.width,canvas.height);
        const result=await this.decode(context.getImageData(0,0,canvas.width,canvas.height));
        return this.manualOpen?{candidates:[],unsupported:[]}:result;
      },
      onResult:result=>{this.detachVideo();this.showResults(result);},
      onStatus:code=>{this.status.textContent=this.message(code);this.updateControls();},
      onError:error=>{this.detachVideo();this.showError(this.cameraError(error));},
    });
    this.click=event=>{const control=event.target.closest('[data-barcode-action]');if(!control||!root.contains(control))return;event.preventDefault();void this.action(control);};
    this.change=event=>{if(event.target.matches('[data-barcode-file]'))void this.readFile(event.target.files?.[0]);};
    this.visibility=()=>{if(document.hidden){this.stopCamera();this.status.textContent=this.message('background');}};
    this.pagehide=()=>this.stopCamera();this.dialog=root.closest('dialog');this.dialogClose=()=>this.stopCamera();
    root.addEventListener('click',this.click);root.addEventListener('change',this.change);document.addEventListener('visibilitychange',this.visibility);globalThis.addEventListener('pagehide',this.pagehide);this.dialog?.addEventListener('close',this.dialogClose);
    this.status.textContent=this.message('initial');
    this.updateControls();
    if(fullscreen)this.mountMobile(onClose);
  }
  mountMobile(onClose){
    this.mobile=true;this.onClose=onClose;this.mobileAbort=new AbortController();const signal=this.mobileAbort.signal,m=key=>escape(this.message(key)),glyph=name=>`<span class="barcode-symbol" data-glyph="${name}" aria-hidden="true"></span>`;
    const section=this.root.querySelector('.barcode-scanner'),camera=this.root.querySelector('[data-barcode-action=camera]'),stop=this.root.querySelector('[data-barcode-action=stop]'),file=this.root.querySelector('.barcode-file-label'),notes=[...section.querySelectorAll(':scope>.mini-note:not(.barcode-status)')],results=this.root.querySelector('.barcode-results');
    section.classList.add('barcode-fullscreen');section.replaceChildren();
    section.innerHTML=`<div class="barcode-camera-ui"><header class="barcode-mobile-header"><button type="button" data-barcode-action="close" aria-label="${m('close')}">${glyph('close')}</button><h2>${m('mobileTitle')}</h2><details class="barcode-help-menu"><summary aria-label="${m('help')}" title="${m('help')}">?</summary><div class="barcode-help"></div></details></header><div class="barcode-stage"><div class="barcode-guide"><span>${m('frame')}</span></div><div class="barcode-feedback"></div></div><footer class="barcode-mobile-footer"><button type="button" data-barcode-action="torch" aria-pressed="false">${glyph('flash_on')}<span>${m('flash')}</span></button><div class="barcode-entry"><span class="barcode-type-symbol">${glyph('barcode')}${glyph('edit')}</span><button type="button" data-barcode-action="manual">${m('type')}</button><form data-barcode-manual hidden><input name="code" aria-label="${m('number')}" placeholder="${m('type')}" required inputmode="numeric" pattern="[0-9]{8,14}" minlength="8" maxlength="14" autocomplete="off"><button type="submit" aria-label="${m('lookupShort')}" hidden>&#10003;</button></form></div></footer></div>`;
    this.mobileUI=section.querySelector('.barcode-camera-ui');this.stage=section.querySelector('.barcode-stage');this.stage.prepend(this.video);this.feedback=section.querySelector('.barcode-feedback');this.feedback.prepend(this.status,this.error,results,camera);stop.hidden=true;section.querySelector('.barcode-help').append(...notes,stop);section.querySelector('.barcode-help').prepend(file);
    this.manualButton=section.querySelector('[data-barcode-action=manual]');this.manualForm=section.querySelector('[data-barcode-manual]');
    this.manualForm.addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();void this.lookup(this.manualForm.elements.code.value);},{signal});
    this.manualForm.elements.code.addEventListener('input',()=>this.updateControls(),{signal});
    this.root.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!this.back())this.onClose();}
    },{signal});
    this.updateControls();void this.action(camera);
  }
  openManual(){
    this.manualOpen=true;this.manualForm.hidden=false;this.manualButton.hidden=true;this.manualForm.elements.code.focus();this.updateControls();
  }
  closeManual(){
    if(!this.manualOpen)return;
    this.cancelLookup();this.manualOpen=false;this.manualForm.hidden=true;this.manualButton.hidden=false;this.manualButton.focus();this.updateControls();
  }
  back(){const help=this.root.querySelector('.barcode-help-menu');if(help?.open){help.open=false;help.querySelector('summary').focus();return true;}if(!this.manualOpen)return false;this.closeManual();return true;}
  cancelLookup(){this.lookupRequest?.abort();this.lookupRequest=null;this.lookupPending=false;}
  async lookup(code,scan){
    if(this.disposed||this.busy||this.lookupPending)return;
    const controller=new AbortController();this.lookupRequest=controller;this.stopCamera();this.lookupPending=true;this.error.hidden=true;this.updateControls();
    try{await this.onCode(code,scan,controller.signal);}catch(error){if(!controller.signal.aborted)this.showError(error?.message||this.message('lookupFailed'));}
    finally{if(this.lookupRequest===controller){this.lookupRequest=null;this.lookupPending=false;if(!this.disposed)this.updateControls();}}
  }
  updateControls(){
    if(this.disposed)return;
    this.root.querySelector('[data-barcode-action=camera]').disabled=this.busy||this.lookupPending||this.camera.pending||this.camera.running;
    this.root.querySelector('[data-barcode-action=stop]').disabled=!this.camera.pending&&!this.camera.running;
    this.root.querySelector('[data-barcode-file]').disabled=this.busy||this.lookupPending;
    this.root.querySelectorAll('[data-barcode-action=confirm]').forEach(button=>{button.disabled=this.busy||this.lookupPending;});
    if(this.mobile){
      const flash=this.root.querySelector('[data-barcode-action=torch]'),running=this.camera.running||this.camera.pending;
      flash.disabled=this.torchPending||!this.camera.torchSupported();flash.setAttribute('aria-pressed',String(this.camera.torchEnabled()));flash.title=this.camera.torchSupported()?this.message('flash'):this.message('flashUnavailable');
      this.root.querySelector('[data-barcode-action=camera]').hidden=running||this.lookupPending;
      this.root.querySelector('.barcode-guide').hidden=!running;this.status.hidden=running;
      this.manualForm.querySelector('button[type=submit]').disabled=this.busy||this.lookupPending;this.manualForm.elements.code.disabled=this.lookupPending;
      this.manualForm.querySelector('button[type=submit]').hidden=!this.manualForm.elements.code.value;
      this.feedback.hidden=running&&this.error.hidden;
    }
  }
  detachVideo(){this.video.pause();this.video.srcObject=null;this.video.hidden=true;this.updateControls();}
  stopCamera(){this.camera.stop();this.detachVideo();}
  clearResults(){this.candidates=[];this.root.querySelector('.barcode-results').innerHTML='';this.error.hidden=true;this.error.textContent='';}
  showError(message){if(this.disposed)return;this.error.textContent=message;this.error.hidden=false;this.status.textContent='';this.updateControls();}
  cameraError(error){
    if(error?.barcodeCode==='decoderUnavailable')return this.message('decoderUnavailable');
    if(error?.name==='NotAllowedError'||error?.name==='SecurityError')return this.message('denied');
    if(error?.name==='NotFoundError')return this.message('noCamera');
    if(error?.name==='NotReadableError')return this.message('busy');
    return error?.message||this.message('cameraFailed');
  }
  showResults({candidates,unsupported}){
    if(this.disposed)return;
    this.candidates=candidates;
    this.status.textContent=candidates.length>1?this.message('multiple'):candidates.length?this.message('confirm'):this.message('none');
    this.root.querySelector('.barcode-results').innerHTML=candidates.map((item,index)=>`<div class="barcode-candidate"><div><strong>${escape(item.rawCode||item.code)}</strong><small>${escape(item.format)}${item.rawCode?` · ${escape(this.message('lookupGtin',{code:item.code}))}`:''}</small></div><button type="button" class="btn" data-barcode-action="confirm" data-index="${index}">${escape(this.message('use'))}</button></div>`).join('')+unsupported.map(item=>`<p class="mini-note">${escape(this.message('detected',{format:item.format,code:item.code,message:item.messageCode==='compressedUnsupported'?this.message('compressedUnsupported'):item.message}))}</p>`).join('');
    this.updateControls();
  }
  async readFile(file){
    if(!file||this.disposed||this.busy||this.lookupPending)return;
    this.stopCamera();this.clearResults();const generation=++this.imageGeneration;this.busy=true;this.status.textContent=this.message('reading');this.updateControls();let bitmap;
    try{
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>MAX_BARCODE_IMAGE_BYTES)throw Error(this.message('invalidImage'));
      bitmap=await createImageBitmap(file);
      if(bitmap.width*bitmap.height>40000000)throw Error(this.message('pixels'));
      if(this.disposed||generation!==this.imageGeneration)return;
      const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const result=await this.decode(context.getImageData(0,0,canvas.width,canvas.height));
      if(!this.disposed&&generation===this.imageGeneration)this.showResults(result);
    }catch(error){if(!this.disposed&&generation===this.imageGeneration)this.showError(error?.barcodeCode==='decoderUnavailable'?this.message('decoderUnavailable'):error?.message||this.message('imageFailed'));}
    finally{bitmap?.close();if(generation===this.imageGeneration){this.busy=false;if(!this.disposed)this.updateControls();}}
  }
  async action(control){
    if(this.disposed)return;
    if(control.dataset.barcodeAction==='camera'){
      if(this.busy||this.lookupPending)return;if(this.manualOpen)this.closeManual();this.clearResults();await this.camera.start();this.updateControls();
    }else if(control.dataset.barcodeAction==='manual'){
      this.openManual();
    }else if(control.dataset.barcodeAction==='manual-close'){
      this.closeManual();
    }else if(control.dataset.barcodeAction==='close'){
      this.cancelLookup();this.onClose();
    }else if(control.dataset.barcodeAction==='torch'){
      if(this.torchPending||!this.camera.torchSupported())return;this.torchPending=true;const generation=this.camera.generation,enabled=!this.camera.torchEnabled();this.updateControls();
      try{const actual=await this.camera.setTorch(enabled);if(!this.disposed&&generation===this.camera.generation&&actual!==enabled)this.showError(this.message('flashUnavailable'));}catch{if(!this.disposed&&generation===this.camera.generation)this.showError(this.message('flashFailed'));}finally{this.torchPending=false;if(!this.disposed)this.updateControls();}
    }else if(control.dataset.barcodeAction==='stop'){
      this.stopCamera();this.status.textContent=this.message('stopped');
    }else if(control.dataset.barcodeAction==='confirm'){
      const candidate=this.candidates[Number(control.dataset.index)];if(!candidate||this.lookupPending)return;
      await this.lookup(candidate.code,{format:candidate.format,decoder:BARCODE_DECODER,...(candidate.rawCode?{rawCode:candidate.rawCode}:{})});
    }
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.mobileAbort?.abort();this.cancelLookup();this.imageGeneration++;this.camera.dispose();this.video.pause();this.video.srcObject=null;
    this.root.removeEventListener('click',this.click);this.root.removeEventListener('change',this.change);document.removeEventListener('visibilitychange',this.visibility);globalThis.removeEventListener('pagehide',this.pagehide);this.dialog?.removeEventListener('close',this.dialogClose);
  }
}
