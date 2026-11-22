import assert from 'node:assert/strict';

// The camera always comes from a generated canvas, including in permission tests.
export async function installSyntheticPhotoCamera(page){
 await page.addInitScript(()=>{
  const state=window.photoCameraFixture={mode:'normal',streams:[],requests:[]};
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async constraints=>{
   state.requests.push(constraints);
   if(state.mode==='denied')throw new DOMException('Synthetic camera denied','NotAllowedError');
   if(state.mode==='missing')throw new DOMException('Synthetic camera unavailable','NotFoundError');
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#4a796b';
   const stream=canvas.captureStream(10),track=stream.getVideoTracks()[0];state.streams.push(stream);
   let flash=false;
   Object.defineProperties(track,{
    getCapabilities:{value:()=>({torch:state.mode==='noFlash'?false:[false,true]})},
    getSettings:{value:()=>({torch:flash})},
    applyConstraints:{value:async constraints=>{flash=constraints.advanced[0].torch;}},
   });
   const interval=setInterval(()=>{if(track.readyState==='ended'){clearInterval(interval);return;}ctx.fillRect(0,0,320,240);},50);
   if(state.mode==='hold')await new Promise(resolve=>state.release=resolve);
   return stream;
  }});state.camera=navigator.mediaDevices.getUserMedia;
 });
}

// Opens and dismisses real app controls. No shutter or recognition operation here.
export async function checkPhotoCameraControls(page,open,{screenshot}={}){
 const camera=page.locator('.photo-entry-camera'),shutter=camera.locator('[data-mpc=shutter]'),close=()=>camera.getByRole('button',{name:'Close',exact:true}).click();
 const stopped=()=>page.waitForFunction(()=>window.photoCameraFixture.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
 const mode=value=>page.evaluate(v=>{window.photoCameraFixture.mode=v;},value);
 const ready=()=>page.waitForFunction(()=>{const v=document.querySelector('.photo-entry-camera video');return v?.videoWidth===320&&v.videoHeight===240&&!document.querySelector('[data-mpc=shutter]').disabled;});
 const choose=async(button,attribute)=>{
  const event=page.waitForEvent('filechooser');await button.click();const picker=await event;const input=picker.element();
  assert.ok(await input.evaluate((el,attr)=>el.hasAttribute(attr),attribute));await input.dispatchEvent('cancel',{bubbles:true});
 };
 assert.ok(await page.evaluate(()=>navigator.mediaDevices?.getUserMedia===window.photoCameraFixture?.camera&&!!window.photoCameraFixture?.camera),'Synthetic camera must be installed before Photo Log opens.');
 await open();await ready();await camera.getByRole('heading',{name:'Photo Log'}).waitFor();
 const flash=camera.getByRole('button',{name:'Flash',exact:true});
 assert.equal(await flash.getAttribute('aria-pressed'),'false');await flash.click();await camera.locator('[data-mpc=flash][aria-pressed=true]').waitFor();await flash.click();await camera.locator('[data-mpc=flash][aria-pressed=false]').waitFor();
 if(screenshot)await page.screenshot({path:screenshot});
 const viewport=page.viewportSize(),fontSize=await page.evaluate(()=>document.documentElement.style.fontSize);
 const metrics=()=>camera.evaluate(root=>{
  const bounds=el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(Math.round);};
  return {header:bounds(root.querySelector('header')),preview:bounds(root.querySelector('video')),buttons:[...root.querySelectorAll('footer button')].map(bounds)};
 });
 const geometry=await metrics();
 if(viewport.width===448&&viewport.height===907){
  assert.deepEqual(geometry.header,[0,0,448,56]);const shutter=geometry.buttons[1];assert.deepEqual(shutter.slice(2),[64,64]);assert.equal(shutter[0],192);assert.ok(Math.abs(shutter[1]-740)<=1);
 }
 for(const size of [{width:320,height:600},{width:760,height:320}]){
  await page.setViewportSize(size);await page.evaluate(()=>document.documentElement.style.fontSize='24px');
  const {buttons,preview}=await metrics();assert.ok(preview[3]>44);
  buttons.forEach(([x,y,w,h],i)=>{assert.ok(x>=0&&y>=0&&x+w<=size.width+1&&y+h<=size.height+1&&w>=44&&h>=44);if(i)assert.ok(x>=buttons[i-1][0]+buttons[i-1][2]);});
 }
 await page.setViewportSize(viewport);await page.evaluate(size=>document.documentElement.style.fontSize=size,fontSize);
 await choose(camera.getByRole('button',{name:'Choose photo'}),'data-mpc-file');await stopped();
 assert.ok(await camera.isVisible());await camera.locator('[data-mpc=retry]').click();await ready();await close();await stopped();
 await mode('noFlash');await open();await ready();assert.ok(await flash.isDisabled());await close();await stopped();
 for(const failure of ['missing','denied']){
  await mode(failure);await open();await camera.locator('[data-mpc=retry]').waitFor();
  await choose(shutter,'capture');assert.ok(await camera.isVisible());await close();
 }
 await mode('hold');await open();await page.waitForFunction(()=>!!window.photoCameraFixture.release);
 await close();await page.evaluate(()=>window.photoCameraFixture.release());await stopped();
 await mode('normal');await open();await ready();
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));await stopped();
 if(await camera.isVisible())await close();
 const calls=await page.evaluate(()=>window.photoCameraFixture.requests);
 assert.ok(calls.length>=6&&calls.every(c=>c.audio===false&&c.video?.facingMode?.ideal==='environment'));
 return {geometry,syntheticRearCamera:true,flashOnOff:true,unsupportedFlashDisabled:true,albumCanceled:true,deniedNativeFallback:true,missingNativeFallback:true,lateTracksStopped:true,navigationTracksStopped:true};
}
