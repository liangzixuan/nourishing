/** Public source identities are independent of local snapshot IDs and labels. */
const positive=value=>Number.isSafeInteger(value)&&value>0;
export function catalogIdentity(source){
  if(!source||typeof source!=='object'||source.userModified||typeof source.datasetId!=='string'||!/^[A-Za-z0-9_-]+$/.test(source.datasetId))return null;
  if(source.provider==='frida'){
    if(source.datasetId!=='frida-6-1-2026'||!positive(source.fridaFoodId)||['fdcId','cnfFoodId','foodCode','cofidRow','afcdFoodKey','afcdBasis','nevoCode','blsCode'].some(key=>source[key]!==undefined))return null;
    return {provider:'frida',id:`frida:${source.datasetId}:${source.fridaFoodId}`,label:'Frida food ID',value:source.fridaFoodId};
  }
  if(source.fridaFoodId!==undefined)return null;
  if(source.provider==='bls'){
    if(source.datasetId!=='bls-4-0-2025'||typeof source.blsCode!=='string'||!/^[A-Z][A-Z0-9]{6}$/.test(source.blsCode)||['fdcId','cnfFoodId','foodCode','cofidRow','afcdFoodKey','afcdBasis','nevoCode'].some(key=>source[key]!==undefined))return null;
    return {provider:'bls',id:`bls:${source.datasetId}:${source.blsCode}`,label:'BLS food code',value:source.blsCode};
  }
  if(source.blsCode!==undefined)return null;
  if(source.provider==='nevo'){
    if(source.datasetId!=='nevo-2025-v9'||!positive(source.nevoCode)||['fdcId','cnfFoodId','foodCode','cofidRow','afcdFoodKey','afcdBasis'].some(key=>source[key]!==undefined))return null;
    return {provider:'nevo',id:`nevo:${source.datasetId}:${source.nevoCode}`,label:'NEVO food code',value:source.nevoCode};
  }
  if(source.nevoCode!==undefined)return null;
  if(source.provider==='afcd'){
    if(source.datasetId!=='afcd-release3'||typeof source.afcdFoodKey!=='string'||!/^F\d{6}$/.test(source.afcdFoodKey)||!['g','mL'].includes(source.afcdBasis)||['fdcId','cnfFoodId','foodCode','cofidRow'].some(key=>source[key]!==undefined))return null;
    return {provider:'afcd',id:`afcd:${source.datasetId}:${source.afcdFoodKey}:${source.afcdBasis}`,label:'AFCD food key',value:source.afcdFoodKey};
  }
  if(source.afcdFoodKey!==undefined||source.afcdBasis!==undefined)return null;
  if(source.provider==='cofid'){
    if(source.datasetId!=='cofid-2021'||typeof source.foodCode!=='string'||!/^\d{2}-\d{3,4}$/.test(source.foodCode)||!positive(source.cofidRow)||source.cofidRow<4||source.fdcId!==undefined||source.cnfFoodId!==undefined)return null;
    return {provider:'cofid',id:`cofid:${source.datasetId}:${source.foodCode}:row:${source.cofidRow}`,label:'CoFID food code',value:source.foodCode};
  }
  if(source.cofidRow!==undefined)return null;
  if(source.provider==='cnf'){
    if(!source.datasetId.startsWith('cnf-')||!positive(source.foodCode)||!positive(source.cnfFoodId)||source.fdcId!==undefined)return null;
    return {provider:'cnf',id:`cnf:${source.datasetId}:${source.foodCode}`,label:'CNF food code',value:source.foodCode};
  }
  if(source.provider!==undefined&&source.provider!=='usda')return null;
  if(!positive(source.fdcId)||source.foodCode!==undefined||source.cnfFoodId!==undefined)return null;
  return {provider:'usda',id:`usda:${source.datasetId}:${source.fdcId}`,label:'FDC ID',value:source.fdcId};
}
export function catalogSourceLabel(source){
  const identity=catalogIdentity(source);
  return identity?`${({cnf:'CNF',cofid:'CoFID',usda:'FDC',afcd:'AFCD',nevo:'NEVO',bls:'BLS',frida:'Frida'})[identity.provider]} ${identity.value}`:'';
}
/** Own catalog measurement semantics for both source normalization and saved
 * snapshots. A Frida volume requires a published density; other source bases
 * retain their explicit mass or volume convention. */
export function catalogMeasurementBasis(source){
  const identity=catalogIdentity(source);if(!identity)return null;
  const mass={grams:100,serving:'100 g'},volume={grams:null,milliliters:100,serving:'100 mL'};
  if(['cofid','nevo'].includes(identity.provider))return source.measurementBasis==='100 ml food'?volume:source.measurementBasis==='100 g food'?mass:null;
  if(identity.provider==='afcd')return source.measurementBasis===`100 ${source.afcdBasis} food`?(source.afcdBasis==='mL'?volume:mass):null;
  if(identity.provider!=='frida')return mass;
  if(source.measurementBasis!=='100 g edible food')return null;
  const density=source.factors?.densityGramsPerMl;
  if(!density||density.parameterId!==363||density.sourceUnit!=='g/ml')return null;
  if(density.value===null||density.value===0)return source.volumeDerivation===undefined?mass:null;
  if(typeof density.value!=='number'||!Number.isFinite(density.value)||density.value<0||density.raw!==density.value||!positive(density.rowNumber))return null;
  const milliliters=100/density.value;
  if(!Number.isFinite(milliliters)||milliliters<0.000001||milliliters>100000)return null;
  const d=source.volumeDerivation;
  if(d&&(d.grams!==100||d.densityParameterId!==363||d.densityRow!==density.rowNumber||d.gramsPerMl!==density.value||d.milliliters!==milliliters))return null;
  return {...mass,milliliters};
}
/** Published synonyms are search labels, never replacements for source identity. */
export function catalogSourceAliases(source){
  const original=source?.originalSource??source;
  return catalogIdentity(original)?.provider==='nevo'&&typeof original.synonym==='string'&&original.synonym.trim()?[original.synonym]:[];
}
/** Source text stays exact. Custom copies retain the credit of their inputs. */
export function sourceAttributions(source){
  const credits=[];
  for(let current=source;current&&typeof current==='object';current=current.originalSource){
    if(typeof current.attribution==='string'&&current.attribution.trim())credits.push(current.attribution);
  }
  return mergeSourceAttributions(credits);
}
export function mergeSourceAttributions(...groups){
  return [...new Set(groups.flatMap(group=>group??[]))];
}
export function validateSourceAttributions(credits){
  if(!Array.isArray(credits)||credits.some(credit=>typeof credit!=='string'||!credit.trim())||new Set(credits).size!==credits.length)throw Error('Source credits are incomplete. Generate a fresh capture.');
  return credits;
}
export function compactFoodSource(source){
  if(!source||typeof source!=='object')return {name:typeof source==='string'?source:'Local food'};
  const compact=Object.fromEntries(['name','datasetId','dataset','provider','fdcId','foodCode','cnfFoodId','cofidRow','afcdFoodKey','afcdBasis','nevoCode','blsCode','fridaFoodId','measurementBasis','releaseDate','url','recordUrl','archiveSha256','license','licenseUrl','attribution','retrievedAt','synonym','userModified']
    .filter(key=>source[key]!==undefined).map(key=>[key,source[key]]));
  if(source.originalSource)compact.originalSource=compactFoodSource(source.originalSource);
  return compact;
}
export function sourceLocatorMatches(source){
  const identity=catalogIdentity(source),locator=source?.recordLocator;
  return Boolean(identity&&locator&&(identity.provider==='frida'
    ?locator.kind==='frida'&&locator.archiveEntry==='FCDB_6.1_Dataset.xlsx'&&locator.worksheet==='Food'&&locator.foodId===source.fridaFoodId&&positive(locator.rowNumber)&&locator.rowNumber>=2
    :identity.provider==='bls'
    ?locator.kind==='bls'&&locator.archiveEntry==='BLS_4_0_2025_DE/BLS_4_0_Daten_2025_DE.xlsx'&&locator.worksheet==='BLS_4_0_Daten_2025_DE'&&locator.foodCode===source.blsCode&&positive(locator.rowNumber)&&locator.rowNumber>=2
    :identity.provider==='nevo'
    ?locator.kind==='nevo'&&locator.archiveEntry==='NEVO2025_v9.0.csv'&&locator.foodCode===source.nevoCode&&positive(locator.rowNumber)&&locator.rowNumber>=2
    :identity.provider==='afcd'
    ?locator.kind==='afcd'&&locator.publicFoodKey===source.afcdFoodKey&&locator.basis===source.afcdBasis&&positive(locator.rowNumber)&&locator.rowNumber>=4&&locator.worksheet===(source.afcdBasis==='g'?'All solids & liquids per 100 g':'Liquids only per 100 mL')
    :identity.provider==='cofid'
    ?locator.kind==='cofid'&&locator.worksheet==='1.2 Factors'&&locator.rowNumber===source.cofidRow&&locator.foodCode===source.foodCode
    :identity.provider==='cnf'
    ?locator.kind==='cnf'&&locator.foodId===source.cnfFoodId&&locator.foodCode===source.foodCode
    :locator.fdcId===source.fdcId));
}
