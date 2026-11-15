// Install controls are optional; browser menus remain available on every platform.
let installPrompt;
const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function refresh(){document.querySelectorAll('[data-install-app]').forEach(button=>{button.hidden=installed()||!installPrompt;});}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;refresh();});
window.addEventListener('appinstalled',()=>{installPrompt=null;refresh();});
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-install-app]');if(!button||!installPrompt)return;
 const prompt=installPrompt;installPrompt=null;refresh();
 try{await prompt.prompt();await prompt.userChoice;}catch{/* Browser installation remains available from its menu. */}
});
if('serviceWorker' in navigator&&window.isSecureContext){
 window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{});},{once:true});
}
export function installButton(){return '<button type="button" class="secondary" data-install-app hidden>Install Nourishing</button>';}
export function refreshInstallButton(){refresh();}
