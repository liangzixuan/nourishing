import {normalizeLibraryDraft,captureCatalogFood} from './domain/workspace.mjs';
import {prepareLibraryDraft as prepare,libraryDraftRows} from './domain/library-editor-draft.mjs';
export {libraryDraftFields,validateLibraryDraft,libraryDraftRows} from './domain/library-editor-draft.mjs';
export const prepareLibraryDraft=(state,kind,draft)=>prepare(state,kind,draft,normalizeLibraryDraft);
/** A detached candidate owns catalog snapshots until the surrounding transaction commits. */
export function captureLibraryDraft(state,kind,input,catalogFoods=new Map()){
 const context=structuredClone(state),draft=structuredClone(input);
 for(const row of libraryDraftRows(kind,draft)){const food=catalogFoods.get(row.foodId);if(food)row.foodId=captureCatalogFood(context,food).id;}
 return {context,draft:prepareLibraryDraft(context,kind,draft)};
}
