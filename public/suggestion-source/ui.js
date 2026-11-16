import {escape} from '../html.js';
export {escape};
const paths={more_vert:'M12 5h.01M12 12h.01M12 19h.01',expand_more:'m6 9 6 6 6-6',chevron_right:'m9 5 7 7-7 7',chevron_left:'m15 5-7 7 7 7',close:'m6 6 12 12M18 6 6 18',back:'m15 5-7 7 7 7'};
export const symbol=name=>`<svg class="material-symbols-rounded md-symbol" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]??paths.chevron_right}"/></svg>`;
export const diarySymbol=symbol;
// Style values come from source numeric projections; CSSOM preserves production CSP.
export function applyCarouselStyles(root){for(const node of root.querySelectorAll('[data-width]'))node.style.width=node.dataset.width+'%';for(const node of root.querySelectorAll('[data-grid-rows]'))node.style.gridTemplateRows=`repeat(${node.dataset.gridRows},auto)`;}
