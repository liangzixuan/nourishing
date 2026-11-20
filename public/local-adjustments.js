import {localWorkspaceState,localLibraryItem} from './local-engine.js';
import {adjustmentSource,adjustmentDraft,adjustmentProjection,adjustmentRevisionFacts} from './report-source/server/diary-adjustment-model.mjs';
import {contentDigestInput} from './report-source/server/content-digest-input.mjs';

const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(contentDigestInput(value))))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
export async function localEntryAdjustment(input){
 const state=await localWorkspaceState();if(!state)return null;
 if(!state.entries.some(row=>row.id===input.id&&row.date===input.date))return null;
 const source=adjustmentSource(state,input,input.kind),draft=adjustmentDraft(state,source.entry,input.kind);
 const rows=await Promise.all(draft.items.map(async item=>{const kind=item.recipeId?'recipe':'food',id=item[kind+'Id'],found=await localLibraryItem({kind,id});return {kind,id,name:found.resource.name,options:found.options};}));
 return {...draft,kind:input.kind,sourceRevision:await digest(adjustmentRevisionFacts(state,source)),rows};
}
export async function localPreviewEntryAdjustment(payload){
 const state=await localWorkspaceState();if(!state)return null;
 if(!state.entries.some(row=>row.id===payload.id&&row.date===payload.date))return null;
 // Newly selected catalog ingredients may not be in the account snapshot yet.
 // The server captures those sources before validating the same draft.
 if(payload.items.some(item=>!state[item.recipeId?'recipes':'foods'].some(row=>row.id===(item.recipeId??item.foodId))))return null;
 const source=adjustmentSource(state,payload,payload.kind);
 if(await digest(adjustmentRevisionFacts(state,source))!==payload.sourceRevision)throw Object.assign(Error('The diary entry or its sources changed. Reopen the adjustment and review it again.'),{status:409});
 return adjustmentProjection(state,source.entry,payload,payload.kind);
}
