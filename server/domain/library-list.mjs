import {isActiveLibraryItem} from './library-status.mjs';

export function updateFavoriteList(items, ref, enabled){
 const matches=item=>item.kind===ref.kind&&item.id===ref.id;
 if(!enabled)return items.filter(item=>!matches(item));
 return items.some(matches)?items:[...items,ref];
}

export function favoriteItems(state,knownItems=[]){
 return (state.settings.favorites??[]).flatMap(ref=>{
  const item=state[ref.kind+'s']?.find(row=>row.id===ref.id);
  // An account can have a pending catalog favorite before its food is captured.
  if(!item)return knownItems.filter(row=>row.kind===ref.kind&&row.id===ref.id).slice(-1);
  return isActiveLibraryItem(item)?[{...ref,name:item.name,serving:item.serving??null,favorite:true}]:[];
 });
}

export const libraryKinds=['food','recipe','meal'];

export function libraryItems(state){
 return libraryKinds.flatMap(kind=>(state[kind+'s']??[]).filter(row=>!row.readOnly).map(({id,name,retired})=>({id,name,kind,retired:!!retired,favorite:(state.settings.favorites??[]).some(ref=>ref.kind===kind&&ref.id===id)})));
}
