import {escape as e} from './html.js';
export const quantityFields=(options,item={})=>{
 const unit=item.quantity===undefined?'servings':item.unit==='portion'?'portion:'+item.portionId:item.unit;
 return `<label class="field-row"><span>Amount</span><input name="amount" type="number" step="any" required value="${e(item.quantity??item.amount??1)}"></label><label class="field-row"><span>Serving</span><select name="unit" aria-label="Serving">${options.map(([id,label])=>`<option value="${e(id)}" ${id===unit?'selected':''}>${e(label)}</option>`).join('')}</select></label>`;
};
export function quantityValue(form){const v=Object.fromEntries(new FormData(form));return v.unit==='servings'?{amount:Number(v.amount)}:{quantity:Number(v.amount),unit:v.unit.startsWith('portion:')?'portion':v.unit,...(v.unit.startsWith('portion:')?{portionId:v.unit.slice(8)}:{})};}
