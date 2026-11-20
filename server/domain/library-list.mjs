export const libraryKinds=['food','recipe','meal'];

export function libraryItems(state){
 return libraryKinds.flatMap(kind=>(state[kind+'s']??[]).filter(row=>!row.readOnly).map(({id,name,retired})=>({id,name,kind,retired:!!retired,favorite:(state.settings.favorites??[]).some(ref=>ref.kind===kind&&ref.id===id)})));
}
