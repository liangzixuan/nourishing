import {convertEnergy,parseEnergyUnit} from './energy-units.mjs';

// Nutrient metadata owns the source unit. Only energy measurements change units.
export function displayUnit(unit,energyUnit='kcal'){
  parseEnergyUnit(energyUnit);
  return unit==='kcal'?energyUnit:unit;
}
export function displayValue(value,unit,energyUnit='kcal'){
  parseEnergyUnit(energyUnit);
  return unit==='kcal'&&value!==undefined?convertEnergy(value,'kcal',energyUnit):value;
}
