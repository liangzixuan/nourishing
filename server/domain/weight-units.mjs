// Exact record identities stay distinct; factors are used only after source selection.
// The local SI pound factor is retained for both lb and lbs. The pinned public
// client uses 0.45359237038 for lbs; see evidence/compound-weight-contract.json.
export const weightKilogramsPerUnit=Object.freeze({kg:'1',lb:'0.45359237',lbs:'0.45359237',st:'6.35029318'});
export const weightUnits=Object.freeze(Object.keys(weightKilogramsPerUnit));
export const publicWeightUnits=Object.freeze(['kg','lbs','st']);
export const isWeightUnit=unit=>typeof unit==='string'&&Object.hasOwn(weightKilogramsPerUnit,unit);
