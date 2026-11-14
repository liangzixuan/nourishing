export const diaryQuickAddActions=Object.freeze([
  {id:'food',label:'Add food'},{id:'exercise',label:'Add exercise'},
  {id:'biometric',label:'Add biometric'},{id:'note',label:'Add note'},
  {id:'barcode',label:'Scan barcode'},{id:'voice',label:'Voice logging'},
  {id:'photo',label:'Photo logging'},{id:'all',label:'All options'},
].map(Object.freeze));
const fail=()=>{throw Object.assign(Error('Choose one supported shortcut for each existing diary group.'),{status:400});};
const keys=(value,names)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===names.length&&names.every(key=>Object.hasOwn(value,key));
export function parseDiaryQuickAdd(value,groups){
  if(value===null)return null;
  if(!keys(value,['version','shortcuts'])||value.version!==1||!Array.isArray(value.shortcuts))fail();
  const seen=new Set();
  const shortcuts=value.shortcuts.map(row=>{
    if(!keys(row,['group','action'])||typeof row.group!=='string'||!groups.includes(row.group)||seen.has(row.group)||!diaryQuickAddActions.some(action=>action.id===row.action))fail();
    seen.add(row.group);return {group:row.group,action:row.action};
  });
  return {version:1,shortcuts};
}
export function diaryQuickAddAction(settings,group){
  const policy=settings.diaryQuickAdd===undefined?null:parseDiaryQuickAdd(settings.diaryQuickAdd,settings.groups);
  return policy?.shortcuts.find(row=>row.group===group)?.action??'food';
}
