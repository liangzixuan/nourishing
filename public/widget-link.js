export function widgetDestination(search){
 const params=new URLSearchParams(search),values=params.getAll('widget');
 return values.length===1&&['diary','food','fasting'].includes(values[0])?values[0]:null;
}
export const widgetQuery=destination=>['diary','food','fasting'].includes(destination)?'?widget='+destination:'';
