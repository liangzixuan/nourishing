import {escape as e} from './html.js';
export function cgmRangeControls(card){
 const range=card.targetRange,custom=range.options.custom;
 return `<fieldset class="cgm-range-controls"><legend>Target range</legend><label class="field-row"><span>Range</span><select name="cgmRange" aria-label="Glucose target range">${[['normal','Normal'],['diabetic','Diabetic'],['custom','Custom']].map(([value,label])=>`<option value="${value}" ${range.mode===value?'selected':''}>${label}</option>`).join('')}</select></label><div data-cgm-custom ${range.mode==='custom'?'':'hidden'}>${[['low','Lower'],['high','Upper'],['fastedHigh','Fasting maximum']].map(([key,label])=>`<label class="field-row"><span>${label} (${e(custom.unit)})</span><input type="number" step="any" min="${range.outerLow}" max="${range.outerHigh}" name="cgm${key}" aria-label="${label}" required value="${custom[key]}"></label>`).join('')}</div></fieldset>`;
}
export function bindCgmRangeControls(form,card){
 const mode=form.elements.cgmRange,group=form.querySelector('[data-cgm-custom]');let edited=false;
 const sync=()=>{group.hidden=mode.value!=='custom';group.querySelectorAll('input').forEach(input=>input.disabled=group.hidden);};mode.onchange=sync;sync();group.oninput=()=>edited=true;
 return ()=>({mode:mode.value,custom:mode.value==='custom'&&(edited||!card.settings.targetRange.custom)?{unit:card.targetRange.options.custom.unit,...Object.fromEntries(['low','high','fastedHigh'].map(key=>[key,Number(form.elements['cgm'+key].value)]))}:card.settings.targetRange.custom});
}
