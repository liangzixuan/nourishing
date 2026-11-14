export function parseHealthConnectGroup(value,groups){
  if(value===null)return null;
  if(typeof value!=='string'||!groups.includes(value))throw Object.assign(Error('Choose an existing diary group for new Health Connect records, or No group.'),{status:400});
  return value;
}
export function healthConnectGroup(settings){return settings.healthConnectGroup===undefined?null:parseHealthConnectGroup(settings.healthConnectGroup,settings.groups);}
