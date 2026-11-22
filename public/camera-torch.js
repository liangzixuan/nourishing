export function supportsCameraTorch(track){
  try{
    const capability=track?.getCapabilities?.().torch;
    return typeof track?.applyConstraints==='function'&&
      (capability===true||Array.isArray(capability)&&capability.includes(true)&&capability.includes(false));
  }catch{return false;}
}
export function cameraTorchEnabled(track){
  try{return track?.getSettings?.().torch===true;}catch{return false;}
}
