(() => {
  if (window.__nourishingInstalled) return;
  window.__nourishingInstalled = true;
  let port, active = false, deviceFontScale = null;
  const pending = new Map();
  let sequence = 0;
  function request(message, {signal, waitForUser = false, cancelOperation} = {}) {
    return new Promise((resolve, reject) => {
      if(signal?.aborted){reject(signal.reason);return;}
      const id = String(++sequence);
      const cleanup=()=>{if(timer)clearTimeout(timer);signal?.removeEventListener('abort',cancel);pending.delete(id);};
      const cancel=()=>{cleanup();if(cancelOperation)port?.postMessage(JSON.stringify({op:cancelOperation,target:id,id:String(++sequence)}));reject(signal.reason);};
      const timer=waitForUser?null:setTimeout(()=>{cleanup();reject(Error('Android did not respond. Please retry.'));},15000);
      pending.set(id, result => {cleanup();result.ok?resolve(result.value):reject(Object.assign(Error(result.error),{code:result.code}));});
      signal?.addEventListener('abort',cancel,{once:true});
      try{port.postMessage(JSON.stringify({...message,id}));}catch(error){cleanup();reject(error);}
    });
  }
  async function transfer(blob, name, kind = 'download') {
    if (!port) throw Error('Android file handling is still starting. Please retry.');
    if (active) throw Error('Finish the current export first.');
    if (blob.size > 32 * 1024 * 1024) throw Error('Download exceeds the 32 MiB Android export limit.');
    active = true;
    try {
      await request({op: 'start', kind, size: blob.size, name, mime: blob.type || 'application/octet-stream'});
      for (let offset = 0; offset < blob.size; offset += 48 * 1024) {
        const bytes = new Uint8Array(await blob.slice(offset, offset + 48 * 1024).arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        await request({op: 'chunk', data: btoa(binary)});
      }
      await request({op: 'end'});
    } catch (error) {
      if (port) port.postMessage(JSON.stringify({op: 'abort', id: String(++sequence)}));
      throw error;
    } finally { active = false; }
  }
  const report = error => window.alert(error.message || String(error));
  async function download(anchor) {
    const response = await fetch(anchor.href);
    if (!response.ok) throw Error(`Download failed (${response.status}).`);
    await transfer(await response.blob(), anchor.download || 'Nourishing-export');
  }
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (port && this.hasAttribute('download') && (this.href.startsWith('blob:') || new URL(this.href, location.href).origin === location.origin)) {
      void download(this).catch(report); return;
    }
    return originalClick.call(this);
  };
  document.addEventListener('click', event => {
    if (port && event.target.closest?.('button[data-nourishing-health-connect]')) {event.preventDefault(); void request({op:'health-connect'}).catch(report); return;}
    const anchor = event.target.closest?.('a[download]');
    if (port && anchor && (anchor.href.startsWith('blob:') || new URL(anchor.href, location.href).origin === location.origin)) {
      event.preventDefault(); void download(anchor).catch(report);
    }
  }, true);
  function connectPrint(target) {
    try {
      target.print = () => transfer(new Blob(['<!doctype html>\n' + target.document.documentElement.outerHTML], {type: 'text/html'}), 'Nourishing report', 'print').catch(report);
    } catch { /* Foreign frames have no native channel. */ }
  }
  function connectFrames() {
    for (const frame of document.querySelectorAll('iframe')) {
      if (frame.dataset.nourishingPrint) continue;
      frame.dataset.nourishingPrint = '1';
      frame.addEventListener('load', () => connectPrint(frame.contentWindow));
      connectPrint(frame.contentWindow);
    }
  }
  window.addEventListener('message', event => {
    if (event.data !== 'nourishing-native-port' || event.ports.length !== 1 || port) return;
    port = event.ports[0];
    port.onmessage = event => {
      const result = JSON.parse(event.data);
      if(result.type === 'font-scale') {
        if(typeof result.value === 'number' && Number.isFinite(result.value) && result.value > 0) {
          deviceFontScale = result.value;
          window.dispatchEvent(new Event('nourishing:devicefontchange'));
        }
        return;
      }
      const callback = pending.get(result.id);
      if (callback) { pending.delete(result.id); callback(result); }
    };
    connectPrint(window); connectFrames();
    new MutationObserver(connectFrames).observe(document.documentElement, {childList: true, subtree: true});
    window.NourishingNative = Object.freeze({dictate:({language,signal})=>request({op:'dictate',language},{signal,waitForUser:true,cancelOperation:'cancel-dictation'}),reminders:Object.freeze({status:({signal}={})=>request({op:'phone-reminders',action:'status'},{signal,cancelOperation:'cancel-phone-reminders'}),connect:({label,signal})=>request({op:'phone-reminders',action:'connect',label},{signal,waitForUser:true,cancelOperation:'cancel-phone-reminders'}),disconnect:({signal}={})=>request({op:'phone-reminders',action:'disconnect'},{signal,waitForUser:true,cancelOperation:'cancel-phone-reminders'}),settings:()=>request({op:'phone-reminders',action:'settings'})}),get deviceFontScale(){return deviceFontScale;},openHealthConnect:()=>request({op:'health-connect'}),shareImage:file=>{if(!(file instanceof Blob)||file.type!=='image/png')return Promise.reject(Error('Share a PNG image.'));return transfer(file,file.name||'Nourishing.png','share-image');}});
    document.documentElement.setAttribute('data-nourishing-native','');
    window.__nourishingReady = true;
    window.dispatchEvent(new Event('nourishing:nativeready'));
  });
})();
