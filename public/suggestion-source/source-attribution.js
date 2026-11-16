import {validateSourceAttributions} from '../report-source/server/catalog-source.mjs';
const escape=value=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function renderSourceAttributions(credits){
  return validateSourceAttributions(credits).map(credit=>`<p class="mini-note" data-source-attribution>${escape(credit)}</p>`).join('');
}
