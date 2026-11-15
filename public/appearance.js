const device=matchMedia('(prefers-color-scheme: dark)');
let theme='dark';
const paint=()=>document.body.classList.toggle('dark',theme==='dark'||theme==='system'&&device.matches);
export function applyTheme(value){theme=['dark','light','system'].includes(value)?value:'dark';paint();}
device.addEventListener('change',paint);
