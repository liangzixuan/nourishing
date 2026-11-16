import {quantityFields as fields,quantityValue} from '../quantity.js';
import {availableQuantityUnits,quantityUnit} from '../report-source/server/quantity-units.mjs';
// Food metadata supplies supported bases. Recipe/meal choices come from the existing server owner.
export function quantityFields(kind,resource,source){
 const options=resource.quantityOptions??[['servings',resource.serving??'Serving'],...availableQuantityUnits(resource).map(unit=>[unit.id,unit.label]),...(resource.portions??[]).map(row=>['portion:'+row.id,row.label])];
 return '<div data-quantity-fields>'+fields(options,source).replace('name="amount"','name="amount" data-quantity-value aria-label="Amount" min="0.000001"').replace('name="unit"','name="unit" data-quantity-unit')+'</div>';
}
export function readQuantityFields(root){return quantityValue(root.matches('form')?root:root.querySelector('form'));}
export function resetQuantityUnit(select){select.closest('[data-quantity-fields]').querySelector('[data-quantity-value]').value=String(quantityUnit(select.value)?.defaultQuantity??1);}
