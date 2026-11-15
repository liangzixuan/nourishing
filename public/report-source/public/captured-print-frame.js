/** Only script-free generated documents belong in this frame. Each panel owns
 * the capture and checks its request generation before accepting readiness. */
export function mountCapturedPrintFrame({container,html,title,onReady}){
 const frame=container.ownerDocument.createElement('iframe');frame.title=title;frame.setAttribute('sandbox','allow-same-origin allow-modals');frame.setAttribute('data-print-frame','');
 frame.addEventListener('load',()=>{if(frame.isConnected&&frame.contentDocument?.title===title)onReady(frame);});frame.srcdoc=html;container.append(frame);return frame;
}
export function printCapturedFrame(frame){frame.contentWindow.focus();frame.contentWindow.print();}
