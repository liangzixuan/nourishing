import {upgradeCarbohydratePolicy} from './carbohydrate-policy.mjs';
// One-way persisted-data boundary. Runtime nutrient inputs never use netCarbs.
// Plan every mutation first so a conflict leaves even detached callers intact.
const own=(value,key)=>Object.hasOwn(value??{},key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const clean=value=>Number(value.toPrecision(12));
const fail=message=>{throw Object.assign(Error(message),{status:400});};

function retainedMeasurement(source,key){
  const row=source.measurements?.[key];
  if(!object(row)||!valid(row.value)||(row.modifier&&row.modifier!=='=')||row.source==='estimate')return null;
  const unit=typeof row.unit==='string'?row.unit.toLowerCase().replace('μ','µ'):'';
  const factor={g:1,mg:.001,ug:.000001,mcg:.000001,'µg':.000001}[unit];
  const value=row.value*factor;
  return factor!==undefined&&Number.isFinite(value)?clean(value):null;
}
function offBasis(food){
  const source=food.source,basis=source?.originalBasis;
  if(!object(source)||source.name!=='Open Food Facts'||source.apiVersion!=='3.6'||source.userModified===true||!object(basis))return false;
  if(typeof food.barcode!=='string'||!/^\d{8,14}$/.test(food.barcode)||source.url!==`https://world.openfoodfacts.org/product/${food.barcode}`)return false;
  if(!['as_sold','prepared'].includes(basis.preparation))return false;
  return basis.aggregatePer==='100g'&&food.serving==='100 g'&&food.grams===100||basis.aggregatePer==='100ml'&&food.serving==='100 mL'&&food.grams===null;
}
const recordedDerivation={nutrient:'carbs',formula:'aggregated carbohydrates + aggregated fiber',reason:'Open Food Facts defines carbohydrates as excluding fiber; carbohydrates-total includes fiber.'};
function unchangedDerivedTotal(food,legacy){
  const source=food.source,values=food.nutrients;
  if(!offBasis(food)||retainedMeasurement(source,'carbohydrates')!==legacy||retainedMeasurement(source,'fiber')!==values.fiber||!valid(values.fiber)||!valid(values.carbs)||own(source.measurements,'carbohydrates-total'))return false;
  if(!Array.isArray(source.derivations)||!source.derivations.some(row=>object(row)&&Object.keys(row).length===3&&Object.entries(recordedDerivation).every(([key,value])=>row[key]===value)))return false;
  return Number.isFinite(legacy+values.fiber)&&values.carbs===clean(legacy+values.fiber);
}

export function canonicalizeCarbohydrates(state){
  if(!object(state))fail('Carbohydrate normalization requires a workspace object.');
  const changes=[],facts={examined:0,changed:0,availableRenamed:0,reportedNetRenamed:0,derivedTotalsRemoved:0,referencesRenamed:0,catalogRemoved:0,policiesMigrated:0};
  const rename=(map,from,to,label)=>{
    if(!object(map)||!own(map,from))return false;
    if(own(map,to)&&!Object.is(map[from],map[to]))fail(`Carbohydrate normalization found conflicting ${label} values. Original records were kept.`);
    const value=map[from];changes.push(()=>{map[to]=value;delete map[from];});return true;
  };
  for(const collection of ['foods','entries'])for(const row of Array.isArray(state[collection])?state[collection]:[]){
    facts.examined++;
    const values=row?.nutrients;if(!object(values))continue;
    const legacy=own(values,'netCarbs');
    if(legacy&&!valid(values.netCarbs))fail('Legacy netCarbs must be a finite nonnegative number. Original records were kept.');
    const value=legacy?values.netCarbs:values.availableCarbs;
    const available=collection==='foods'&&valid(value)&&offBasis(row)&&retainedMeasurement(row.source,'carbohydrates')===value;
    if(available&&unchangedDerivedTotal(row,value)){changes.push(()=>{delete values.carbs;});facts.derivedTotalsRemoved++;}
    if(!legacy)continue;
    rename(values,'netCarbs',available?'availableCarbs':'reportedNetCarbs','nutrient');
    facts[available?'availableRenamed':'reportedNetRenamed']++;
  }
  function targets(map){if(rename(map,'netCarbs','reportedNetCarbs','target'))facts.referencesRenamed++;}
  function settings(value){
    if(!object(value))return;
    if(own(value,'carbohydratePolicy')){
      const {changed,policy}=upgradeCarbohydratePolicy(value.carbohydratePolicy);
      if(changed){changes.push(()=>{value.carbohydratePolicy=policy;});facts.policiesMigrated++;}
    }
    targets(value.targets);
    if(object(value.macroSchedule))for(const [day,map]of Object.entries(value.macroSchedule))if(/^[0-6]$/.test(day))targets(map);
    if(object(value.targetSetup))targets(value.targetSetup.targets);
    if(Array.isArray(value.scoreSelection))value.scoreSelection.forEach((id,index)=>{if(id==='netCarbs'){changes.push(()=>{value.scoreSelection[index]='reportedNetCarbs';});facts.referencesRenamed++;}});
  }
  settings(state.settings);
  for(const client of Array.isArray(state.clients)?state.clients:[])targets(client?.targets);
  // Existing message templates contain free text, not nutrient settings.
  for(const chart of Array.isArray(state.charts)?state.charts:[]){
    facts.examined++;
    if(!object(chart))continue;
    if(chart.version===2){
      for(const key of ['primary','secondary'])if(chart[key]?.kind==='nutrient'&&chart[key].id==='netCarbs'){changes.push(()=>{chart[key].id='reportedNetCarbs';});facts.referencesRenamed++;}
    }else if(chart.version===undefined){
      for(const key of ['x','y'])if(chart[key]==='netCarbs'){changes.push(()=>{chart[key]='reportedNetCarbs';});facts.referencesRenamed++;}
    }
  }
  if(own(state,'catalog')){changes.push(()=>{delete state.catalog;});facts.catalogRemoved=1;}
  facts.changed=changes.length;
  for(const change of changes)change();
  return facts;
}

export function migrateCarbohydrates(store){
  const preview=canonicalizeCarbohydrates(store.read());
  if(!preview.changed)return {...preview,recoverySnapshotId:null};
  let result;
  store.update(state=>{
    const facts=canonicalizeCarbohydrates(state);
    result={...facts,recoverySnapshotId:facts.changed?store.backup():null};
  });
  return result;
}
