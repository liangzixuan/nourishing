export {escape} from '../html.js';
export const symbol=name=>`<svg class="dc-symbol-svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="${name==='close'?'m6 6 12 12M18 6 6 18':'m6 9 6 6 6-6'}"/></svg>`;
