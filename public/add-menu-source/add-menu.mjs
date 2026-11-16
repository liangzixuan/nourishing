export const addMenuActions = Object.freeze([
  {id:'food', label:'Search Food', icon:'search', color:'#ffc7b3'},
  {id:'barcode', label:'Scan Barcode', icon:'barcode_scanner', color:'#b9edcb'},
  {id:'photo', label:'Photo Log', icon:'photo_camera', color:'#91bec0'},
  {id:'voice', label:'Voice Log', icon:'mic', color:'#e6bfed'},
  {id:'suggest', label:'Suggest Food', icon:'help'},
  {id:'biometric', label:'Add Biometric', icon:'favorite'},
  {id:'note', label:'Add Note', icon:'description'},
  {id:'fast', label:'New Fast', icon:'timer'},
  {id:'exercise', label:'Add Exercise', icon:'directions_run'},
].map(Object.freeze));
export const addMenuColors = Object.freeze(['#ffc7b3','#ffdeab','#fff4af','#d5edb4','#b9edcb','#b6e7df','#b9eaf0','#91bec0','#bbcce9','#d3c6ed','#e6bfed','#f0bfd5','#ff9377','#eac775','#a3cd8b','#79b7a9','#a6a9b8','#e8e9ed']);
export function parseAddMenu(value) {
  if(value == null) return {version:1,order:addMenuActions.map(x=>x.id),hidden:[],colors:Object.fromEntries(addMenuActions.filter(x=>x.color).map(x=>[x.id,x.color])),swapped:false};
  const fail=()=>{throw Object.assign(Error('Invalid Add menu preferences.'),{status:400});};
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['version','order','hidden','colors','swapped'].includes(k))||value.version!==1||typeof value.swapped!=='boolean')fail();
  const ids=addMenuActions.map(x=>x.id), list=(x,complete)=>Array.isArray(x)&&x.every(id=>ids.includes(id))&&new Set(x).size===x.length&&(!complete||x.length===ids.length);
  if(!list(value.order,true)||!list(value.hidden,false)||value.hidden.length===ids.length||!value.colors||typeof value.colors!=='object'||Array.isArray(value.colors))fail();
  for(const [id,color] of Object.entries(value.colors))if(!ids.includes(id)||!addMenuColors.includes(color))fail();
  return {version:1,order:[...value.order],hidden:[...value.hidden],colors:{...value.colors},swapped:value.swapped};
}
