/** Standard food quantity units. Ounces here are avoirdupois mass, never fluid
 * ounces. The international pound is exactly 453.59237 g; an ounce is 1/16 lb.
 * A litre is exactly 1000 mL. No mass/volume conversion is implied. */
export const quantityUnits=Object.freeze([
  Object.freeze({id:'g',label:'Grams (g)',basis:'grams',factor:1,defaultQuantity:100}),
  Object.freeze({id:'oz',label:'Ounces (oz, weight)',basis:'grams',factor:28.349523125,defaultQuantity:1}),
  Object.freeze({id:'mL',label:'Millilitres (mL)',basis:'milliliters',factor:1,defaultQuantity:100}),
  Object.freeze({id:'L',label:'Litres (L)',basis:'milliliters',factor:1000,defaultQuantity:1}),
]);
const byId=new Map(quantityUnits.map(unit=>[unit.id,unit]));
export const quantityUnit=id=>byId.get(id)??null;
export const isQuantityUnit=id=>byId.has(id);
export function availableQuantityUnits(basis={}){
  return quantityUnits.filter(unit=>typeof basis?.[unit.basis]==='number'&&Number.isFinite(basis[unit.basis])&&basis[unit.basis]>0);
}
