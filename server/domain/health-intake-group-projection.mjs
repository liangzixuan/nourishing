import {knownHealthNutrient,projectHealthNutrition} from './health-intake-nutrients.mjs';
const negative=facts=>Object.values(facts.nutrients).some(value=>typeof value==='number'&&value<0);
export function projectIntakeGroup(group){
 if(negative(group))return {status:'unrepresentable',reasonCode:'negative',reason:'The combined intake still has a negative nutrient amount. No value was clamped or omitted to hide a correction.'};
 const base={id:group.anchor.id,date:group.date,time:group.anchor.time,clientRecordId:group.anchor.clientRecordId,name:group.components.map(c=>c.name).join(' + ')};
 if(group.kind==='nutrition'){
  const fields=projectHealthNutrition(group);
  if(!Object.keys(fields.record.nutrients).length)return {status:'unrepresentable',reasonCode:'no-supported',reason:'No supported nutrient has a completely known combined amount.'};
  return {status:'needs-native-review',record:{...base,...fields.record},presentation:fields.presentation};
 }
 if(group.attributions.length)return {status:'unrepresentable',reasonCode:'water-credits',reason:'Health Connect hydration records cannot retain the required source credits.'};
 if(!knownHealthNutrient(group,'water'))return {status:'unrepresentable',reasonCode:'water-unknown',reason:'Combined food water is missing or only partially known.'};
 if(group.nutrients.water>100000)return {status:'unrepresentable',reasonCode:'water-range',reason:'Combined food water exceeds the Health Connect volume range.'};
 const detail={id:'water',name:'Water within food',value:group.nutrients.water,unit:'mL'}, {id,...nativeDetail}=detail;
 return {status:'needs-native-review',record:{...base,milliliters:group.nutrients.water,attributions:[],details:[nativeDetail],omitted:[]},presentation:{details:[detail],omissions:[]}};
}

