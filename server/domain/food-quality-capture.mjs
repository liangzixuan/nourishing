import {captureFoodQualityGuidance} from './food-quality-guidance.mjs';
import {catalog} from './nutrient-catalog.mjs';
import {captureSourceDataQuality} from './source-data-quality.mjs';
import {sourceNutrients} from './source-nutrient-registry.mjs';
export function captureFoodAvailability(entries){const capture=captureSourceDataQuality(entries,sourceNutrients);return {...capture,byId:new Map(capture.nutrients.map(r=>[r.id,r]))};}
const labels=new Map([...catalog.map(r=>[r.id,r]),['netCarbohydrate',{name:'Net carbohydrate',unit:'g'}]]);
const registry=new Map(sourceNutrients.map(r=>[r.id,r]));
function project(byId,componentIds){
 if(new Set(componentIds).size!==componentIds.length)throw Error('Source confidence nutrient identities must be unique.');
 let sum=0;for(const id of componentIds){if(!registry.has(id)||!byId.has(id))throw Error('Unmapped source confidence nutrient: '+id);sum+=byId.get(id).ratio;}
 const rawValue=componentIds.length?100*sum/componentIds.length:0;
 return {rawValue,value:Math.round(rawValue),componentIds:[...componentIds]};
}
/** One availability traversal supplies visible quality and component confidence. */
export function captureDayFoodQuality({date,capture,hidden,groups}){
 const byId=capture.byId;
 return {version:3,date,method:capture.method,foodEntryCount:capture.foodEntryCount,nutrients:capture.nutrients.map(r=>({...r,name:labels.get(r.id).name,unit:labels.get(r.id).unit})),overall:project(byId,sourceNutrients.filter(r=>!hidden.has(r.id)).map(r=>r.id)),groups:groups.map(({id,name,componentIds})=>({id,name,...project(byId,componentIds)})),limitations:captureFoodQualityGuidance()};
}

export function sourceScoreConfidence(capture,componentIds){const projected=project(capture.byId,componentIds);return {method:capture.method,foodEntryCount:capture.foodEntryCount,value:projected.rawValue,componentIds:projected.componentIds};}
export function dataQualityScoreFacts(definition,capture,hidden){
 const componentIds=sourceNutrients.filter(r=>!hidden.has(r.id)).map(r=>r.id),projected=project(capture.byId,componentIds),rows=componentIds.map(id=>capture.byId.get(id));
 const known=rows.filter(r=>r.availabilitySum>0).length;
 return {componentIds,components:[],score:{id:definition.id,name:definition.name,method:definition.method,description:definition.description,value:projected.rawValue,coverage:{known,total:rows.length,complete:rows.length>0&&capture.foodEntryCount>0&&rows.every(r=>r.ratio===1)}}};
}
