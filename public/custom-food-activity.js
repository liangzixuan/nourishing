import {escape as e} from './html.js';
/** Authored form choices only. Conversion and validation belong to the canonical server. */
export function vitaminFormsMarkup(row,open=false){
 if(!row.forms?.length)return '';
 const shares=row.knownForms??{},keys=Object.keys(shares),choice=keys.length===1&&Number(shares[keys[0]])===100?keys[0]:keys.length?'mixed':'';
 return `<details class="mfl-activity" data-activity="${e(row.id)}" ${open?'open':''}><summary>Known vitamin forms</summary><label>Vitamin form<select data-activity-form aria-label="${e(row.name)} form"><option value="">Unknown</option>${row.forms.map(form=>`<option value="${e(form.id)}" ${choice===form.id?'selected':''}>${e(form.name)}</option>`).join('')}<option value="mixed" ${choice==='mixed'?'selected':''}>Mixed forms</option></select></label><div data-activity-shares ${choice==='mixed'?'':'hidden'}>${row.forms.map(form=>`<label>${e(form.name)} (%)<input data-activity-share="${e(form.id)}" inputmode="decimal" aria-label="${e(row.name+' '+form.name+' share')}" value="${e(shares[form.id]??'')}"></label>`).join('')}</div><small>Shares of the stated IU amount must total 100%.</small></details>`;
}
export function readVitaminForms(row){
 const choice=row.querySelector('[data-activity-form]')?.value;
 if(!choice)return undefined;
 if(choice!=='mixed')return {[choice]:'100'};
 return Object.fromEntries([...row.querySelectorAll('[data-activity-share]')].filter(input=>input.value!=='').map(input=>[input.dataset.activityShare,input.value]));
}
