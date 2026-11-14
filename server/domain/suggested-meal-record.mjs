const fail=message=>{throw Object.assign(Error(message),{status:400});};
export function suggestedMealName(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||typeof value.name!=='string'||!value.name.trim()||value.name.length>300)fail('Supply a meal name of 1 to 300 characters.');
 return {name:value.name.trim()};
}
export function suggestedMealRecord(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='id,name,version'||value.version!==1||typeof value.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id))fail('The suggested meal link is invalid.');
 return {version:1,id:value.id,...suggestedMealName({name:value.name})};
}
