import {recipeAncestors,collectResourceDependencies} from './resource-dependencies.mjs';
import {sha256Hex} from './content-digest.mjs';
import {parseLibraryStatus} from './library-status.mjs';
const collections=new Map([['food','foods'],['recipe','recipes'],['meal','meals']]);
const invalid=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export function inspectLibraryUses(state,input,{allowReadOnly=false}={}){
 if(!collections.has(input.kind)||typeof input.id!=='string'||!input.id.trim())invalid('Choose a custom food, recipe or meal.');
 const collection=collections.get(input.kind),item=state[collection].find(item=>item.id===input.id);if(!item)invalid('This library item no longer exists.',404);if(item.readOnly&&!allowReadOnly)invalid('Only custom library items can be changed.');
 const retired=Boolean(parseLibraryStatus(item).retired),recipes=input.kind==='meal'?[]:recipeAncestors(state,input.kind==='food'?'foodId':'recipeId',item.id),recipeIds=new Set([...(input.kind==='recipe'?[item.id]:[]),...recipes.map(row=>row.id)]);
 const refers=row=>(input.kind==='food'&&row.foodId===item.id)||recipeIds.has(row.recipeId),meals=state.meals.filter(row=>row.items.some(refers)),mealIds=new Set(input.kind==='meal'?[item.id]:meals.map(row=>row.id)),uses=row=>row.mealItems!==undefined||row.recipeOverride!==undefined?collectResourceDependencies(state,[row])[collection].some(resource=>resource.id===item.id):refers(row)||mealIds.has(row.mealId);
 const entries=state.entries.filter(uses),repeats=state.repeats.filter(uses),favorites=(state.settings.favorites??[]).filter(row=>row.kind===input.kind&&row.id===item.id),references={entries,recipes,meals,repeats,favorites};
 const counts=Object.fromEntries(Object.entries(references).map(([key,rows])=>[key,rows.length]));
 const fingerprint=sha256Hex(JSON.stringify({kind:input.kind,item,references,dependencies:collectResourceDependencies(state,[{[input.kind+'Id']:item.id},...recipes.map(row=>({recipeId:row.id})),...meals.map(row=>({mealId:row.id})),...entries])}));
 return {item,collection,references,view:{kind:input.kind,id:item.id,name:item.name,retired,counts,fingerprint}};
}
