export {escape} from '../html.js';
const paths={info:'M12 11v6m0-10h.01',back:'m15 5-7 7 7 7',close:'m6 6 12 12M18 6 6 18',help:'M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01'};
export const symbol=name=>`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(name==='help'||name==='info')?'<circle cx="12" cy="12" r="10"/>':''}<path d="${paths[name]??paths.back}"/></svg>`;
