const fail=()=>{throw Object.assign(Error('A note photo needs a valid image ID.'),{status:400});};
export function notePhotoFields(value){
  if(!Object.hasOwn(value,'imageId'))return {};
  if(typeof value.imageId!=='string'||!/^[a-f0-9]{64}$/.test(value.imageId))fail();
  return {imageId:value.imageId};
}
export function notePhotoIds(state){return [...new Set((state.notes??[]).flatMap(row=>Object.values(notePhotoFields(row))))];}
