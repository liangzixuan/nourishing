const inputRows=rows=>rows.map(({ref,quantity,unit,portionId})=>({ref:{...ref},quantity,unit,...(unit==='portion'?{portionId}:{})}));
/** Owns one unsaved meal and the projection of its current ingredient revision. */
export class MealSuggestionDraft {
 constructor({item,date,request,localPreview=async()=>null,onChange=()=>{}}){Object.assign(this,{item:structuredClone(item),rows:structuredClone(item.rows),date,request,localPreview,onChange});this.status='idle';this.version=0;this.disposed=false;this.preview=null;this.error='';}
 get ready(){return !this.disposed&&this.status==='ready'&&!!this.preview;}
 begin(status){this.controller?.abort();this.controller=new AbortController();this.version++;this.preview=null;this.error='';this.status=status;this.onChange(this);return {version:this.version,signal:this.controller.signal};}
 current(version){return !this.disposed&&this.version===version;}
 async refresh(){
  if(this.disposed)return false;
  const {version,signal}=this.begin(this.rows.length?'loading':'empty');if(!this.rows.length)return false;
  const rows=inputRows(this.rows);
  try{const value=(await this.localPreview({date:this.date,rows}))??await this.request('/api/insights/meals/preview',{method:'POST',signal,body:JSON.stringify({date:this.date,rows})});if(!this.current(version))return false;
   if(!Array.isArray(value?.rows)||value.rows.length!==rows.length||!value.meal?.totals||!value.before||!value.after||value.rows.some((row,index)=>typeof row.name!=='string'||row.ref?.kind!==rows[index].ref.kind||row.ref?.id!==rows[index].ref.id||row.quantity!==rows[index].quantity||row.unit!==rows[index].unit||row.portionId!==rows[index].portionId))throw Error('The meal preview did not match the selected ingredients.');
   this.preview=value;this.rows=structuredClone(value.rows);this.status='ready';this.onChange(this);return true;
  }catch(error){if(this.current(version)){this.status='error';this.error=error.message;this.onChange(this);}return false;}
 }
 remove(index){if(this.disposed||!Number.isInteger(index)||index<0||index>=this.rows.length)return false;this.rows=this.rows.filter((_,i)=>i!==index);return this.refresh();}
 updateQuantity(index,{quantity,unit,portionId}){
  if(this.disposed||!Number.isInteger(index)||index<0||index>=this.rows.length)return false;
  const {portionId:oldPortion,amount:oldAmount,grams:oldGrams,...row}=this.rows[index];this.rows=this.rows.map((value,i)=>i===index?{...row,quantity,unit,...(unit==='portion'?{portionId}:{})}:value);return this.refresh();
 }
 append(rows){
  if(this.disposed)return false;
  if(!Array.isArray(rows)||!rows.length)throw Error('This selection has no usable ingredients.');
  this.rows=[...this.rows,...structuredClone(rows)];return this.refresh();
 }
 reviewedMeal(){if(!this.ready)throw Error('Wait for the current meal preview.');return {...structuredClone(this.item),rows:structuredClone(this.preview.rows),nutrition:structuredClone(this.preview.meal),attributions:structuredClone(this.preview.meal.attributions??[])};}
 dispose(){this.disposed=true;this.version++;this.controller?.abort();this.preview=null;}
}
