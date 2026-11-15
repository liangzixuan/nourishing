import {createHomeWidgetView} from './domain/home-widgets.mjs';

export function cloudHomeWidgetView(state,{accountId,origin,now,timeZone,unit='kcal'}){
 const url=new URL(origin);
 if(!accountId||url.protocol!=='https:'||url.origin!==origin)throw Error('Cloud widget identity is unavailable.');
 return {...createHomeWidgetView(state,{now,timeZone,unit}),version:3,access:{mode:'cloud',origin,accountId}};
}
