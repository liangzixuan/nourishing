import {uiLanguage,t} from './app-language.js';
import {fc} from './food-cloud-messages.js';
import {escape as e} from './html.js';
/** Authored form choices only. Conversion and validation belong to the canonical server. */
export function vitaminFormsMarkup(row,open=false){
 if(!row.forms?.length)return '';
 const formName=form=>t('nutritionLabel.form.'+form.id);
 const shares=row.knownForms??{},keys=Object.keys(shares),choice=keys.length===1&&Number(shares[keys[0]])===100?keys[0]:keys.length?'mixed':'';
 return `<details class="mfl-activity" data-activity="${e(row.id)}" ${open?'open':''}><summary>${e(fc("knownVitaminForms"))}</summary><label>${e(fc("vitaminForm"))}<select data-activity-form aria-label="${e(fc('vitaminFormAria',{name:row.name}))}"><option value="">${e(t("common.unknown"))}</option>${row.forms.map(form=>`<option value="${e(form.id)}" ${choice===form.id?'selected':''}>${e(formName(form))}</option>`).join('')}<option value="mixed" ${choice==='mixed'?'selected':''}>${e(fc("mixedForms"))}</option></select></label><div data-activity-shares ${choice==='mixed'?'':'hidden'}>${row.forms.map(form=>`<label>${e(formName(form))} (%)<input data-activity-share="${e(form.id)}" inputmode="decimal" aria-label="${e(fc('vitaminShareAria',{name:row.name,form:formName(form)}))}" value="${e(shares[form.id]??'')}"></label>`).join('')}</div><small>${e(fc("sharesTotal"))}</small></details>`;
}
export function readVitaminForms(row){
 const choice=row.querySelector('[data-activity-form]')?.value;
 if(!choice)return undefined;
 if(choice!=='mixed')return {[choice]:'100'};
 return Object.fromEntries([...row.querySelectorAll('[data-activity-share]')].filter(input=>input.value!=='').map(input=>[input.dataset.activityShare,input.value]));
}
