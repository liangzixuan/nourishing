export function canShareImage(file){return typeof navigator.share==='function'&&navigator.canShare?.({files:[file]})===true;}

// Keep this call in the click handler: native sharing requires user activation.
export async function shareImage(file,title){
 if(!canShareImage(file))return 'unavailable';
 try{await navigator.share({files:[file],title});return 'shared';}
 catch(error){if(error.name==='AbortError')return 'cancelled';if(error.name==='NotAllowedError')return 'unavailable';throw error;}
}

export function saveImage(file){
 const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;
 document.body.append(link);try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
}
