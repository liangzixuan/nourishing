import {inspectLibraryUses} from './domain/library-references.mjs';
import {collectResourceDependencies} from './domain/resource-dependencies.mjs';
import {persistLibraryDraft} from './domain/workspace.mjs';
import {contentDigest} from './domain/content-digest.mjs';
import {digest} from './data-codec.mjs';
import {validateLibraryDraft,captureLibraryDraft,libraryDraftRows} from './library-drafts.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status,code:status,publicMessage:message});};
export function validateLibraryEdit(input,{saving=false}={}){
 const keys=saving?['kind','draft','reviewToken','mode','confirmed']:['kind','draft'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!keys.includes(key)))fail('Supply the reviewed library edit fields.');
 validateLibraryDraft(input.kind,input.draft,{editing:true});
 if(!input.draft.id)fail('Choose the library item to edit.');
 if(saving&&(input.confirmed!==true||!['update','preserve'].includes(input.mode)||typeof input.reviewToken!=='string'||!/^[a-f0-9]{64}$/.test(input.reviewToken)))fail('Review and confirm how to save this item.');
}
function evaluate(state,input,{owner,catalogFoods=new Map()}={}){
 if(typeof owner!=='string'||!owner)fail('Please sign in.',401);
 const {item,view}=inspectLibraryUses(state,{kind:input.kind,id:input.draft.id});
 const {context,draft}=captureLibraryDraft(state,input.kind,input.draft,catalogFoods);
 const dependencies=collectResourceDependencies(context,libraryDraftRows(input.kind,draft));
 const reviewToken=contentDigest({owner,kind:input.kind,draft,uses:view.fingerprint,dependencies});
 return {item,draft,context,view:{revision:digest(state),kind:input.kind,id:item.id,name:item.name,counts:view.counts,hasUses:Object.values(view.counts).some(count=>count>0),reviewToken}};
}
export function previewLibraryEdit(state,input,context){validateLibraryEdit(input);return evaluate(state,input,context).view;}
/** The workspace store commits this detached candidate and its command receipt atomically. */
export function applyLibraryEdit(state,input,context){
 validateLibraryEdit(input,{saving:true});const reviewed=evaluate(state,input,context);
 if(reviewed.view.reviewToken!==input.reviewToken)fail('The draft, item or its uses changed. Review the edit again.',409);
 const next=structuredClone(reviewed.draft),candidate=reviewed.context;
 if(input.mode==='preserve'){delete next.id;delete next.retired;candidate[input.kind+'s'].find(row=>row.id===reviewed.item.id).retired=true;}
 const id=persistLibraryDraft(candidate,input.kind,next);Object.assign(state,candidate);return {kind:input.kind,id};
}
