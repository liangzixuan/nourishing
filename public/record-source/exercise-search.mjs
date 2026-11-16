const normalize=value=>value.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g,' ').trim();
/** Search the parsed source records identically in the API and mobile browser. */
export function createExerciseSearch(records,headings){
 const names=new Map(headings.map(row=>[row.id,row.name])),index=new Map(records.map(row=>[row.code,normalize(row.code+' '+row.description+' '+names.get(row.heading))]));
 return (q='',heading=null)=>{if(typeof q!=='string'||(heading!==null&&!names.has(heading)))throw Object.assign(new Error('Choose valid exercise search fields.'),{status:400});const words=normalize(q).split(' ').filter(Boolean);return records.filter(row=>(heading===null||row.heading===heading)&&words.every(word=>index.get(row.code).includes(word)))};
}
