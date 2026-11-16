import {escape as e} from './html.js';
const row=(label,name,value,attrs='')=>`<label class="field-row"><span>${e(label)}</span><input name="${e(name)}" value="${e(value??'')}" ${attrs}></label>`;
export function foodEditorDraft(resource){return {name:resource?.name??'',serving:resource?.serving??'1 serving',grams:resource?resource.grams??null:100,milliliters:resource?.milliliters??null,barcode:resource?.barcode??'',notes:resource?.notes??'',nutrients:{...resource?.nutrients}};}
export function foodEditorFields(draft,nutrients){
 const main=new Set(['calories','protein','carbs','fat','fiber','sodium']),field=n=>row(`${n.name} (${n.unit})`,'nutrient:'+n.id,draft.nutrients?.[n.id],'type="number" min="0" step="any"');
 return `${row('Serving','serving',draft.serving,'required maxlength="100"')}${row('Weight (g)','grams',draft.grams,'type="number" min="0.001" max="100000" step="any"')}${row('Volume (mL)','milliliters',draft.milliliters,'type="number" min="0.000001" max="100000" step="any"')}<h3>Per serving</h3>${nutrients.filter(n=>main.has(n.id)).map(field).join('')}<details><summary>More nutrients</summary>${nutrients.filter(n=>!main.has(n.id)).map(field).join('')}</details><details><summary>Notes & barcode</summary>${row('Barcode','barcode',draft.barcode,'maxlength="100"')}<label>Notes<textarea name="notes" maxlength="4000">${e(draft.notes??'')}</textarea></label></details>`;
}
export function readFoodEditorFields(form,nutrients,draft={}){
 const values=Object.fromEntries(new FormData(form)),facts={...draft.nutrients};
 for(const {id}of nutrients){const value=values['nutrient:'+id];if(value==='')delete facts[id];else facts[id]=Number(value);}
 return {name:values.name,serving:values.serving,grams:values.grams===''?null:Number(values.grams),milliliters:values.milliliters===''?null:Number(values.milliliters),barcode:values.barcode,notes:values.notes,nutrients:facts};
}
