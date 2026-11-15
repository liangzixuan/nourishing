import {validateSourceAttributions} from './../server/catalog-source.mjs';
const escape=value=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function renderSourceAttributions(credits){
  return validateSourceAttributions(credits).map(credit=>`<p class="mini-note" style="overflow-wrap:anywhere" data-source-attribution>${escape(credit)}</p>`).join('');
}
