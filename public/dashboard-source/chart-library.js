let pending;
// Scriptable chart options read the same palette as their surrounding surface.
export const chartColor=name=>()=>getComputedStyle(document.body).getPropertyValue('--'+name).trim();
const updateAppearance=()=>{for(const chart of Object.values(window.Chart?.instances??{}))chart.update('none');};
window.addEventListener('nourishing:appearancechange',updateAppearance);
window.addEventListener('nourishing:fontchange',updateAppearance);
window.addEventListener('beforeprint',updateAppearance);
window.addEventListener('afterprint',updateAppearance);
export function chartLibrary(){
 if(window.Chart)return Promise.resolve(window.Chart);
 if(pending)return pending;
 pending=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/dashboard-source/chart.umd.js';script.onload=()=>resolve(window.Chart);script.onerror=()=>{pending=null;script.remove();reject(Object.assign(Error('Charts could not load. Please try again.'),{code:'chart-load'}));};document.head.append(script);});
 return pending;
}
