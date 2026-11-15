import Big from './../vendor/big.js/7.0.1/big.mjs';
/** Logged-water identity and unit conversion, shared by diary totals and export. */
export const isLoggedWater=row=>String(row.type).toLowerCase()==='water';
export function loggedWaterMilliliters(row){
 if(!isLoggedWater(row)||typeof row.value!=='number'||!Number.isFinite(row.value)||row.value<0)return null;
 const unit=String(row.unit??'mL').toLowerCase();if(!['ml','l','milliliter','milliliters'].includes(unit))return null;
 const value=Number(new Big(row.value).times(unit==='l'?1000:1));return Number.isFinite(value)?value:null;
}
