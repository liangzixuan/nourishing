const invalid=message=>{throw Object.assign(Error(message),{status:400});};
/** Personal library visibility is independent of resource identity and nutrition. */
export function parseLibraryStatus(item){
 if(!item||typeof item!=='object'||Array.isArray(item))invalid('Library status requires an item.');
 if(!Object.hasOwn(item,'retired'))return {};
 if(typeof item.retired!=='boolean')invalid('Retired status must be true or false.');
 if(item.retired&&item.readOnly)invalid('Only custom library items can be retired.');
 return item.retired?{retired:true}:{};
}
export const isActiveLibraryItem=item=>parseLibraryStatus(item).retired!==true;
export const libraryChoices=(items,selectedId)=>items.filter(item=>isActiveLibraryItem(item)||item.id===selectedId);
export function withoutLibraryStatus(item){parseLibraryStatus(item);const {retired,...facts}=item;return facts;}
export function libraryStatusForSave(input,previous){
 const incoming=parseLibraryStatus(input);if(!previous)return incoming;
 const current=parseLibraryStatus(previous);
 if(Object.hasOwn(input,'retired')&&Boolean(incoming.retired)!==Boolean(current.retired))invalid('Use the reviewed retirement action to change library visibility.');
 return current;
}
