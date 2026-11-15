const impact={notes:'note-date',biometrics:'biometric-impact',entries:'exercise-impact'};
export function correctionWarningCodes(collection,before,after){
 if(!Object.hasOwn(impact,collection))throw Error('Unknown correction collection.');
 const codes=[impact[collection]];
 if((before.group??null)!==(after.group??null))codes.push('group-placement');
 if(collection==='biometrics'&&(after.type!==before.type||after.unit!==before.unit))codes.push('metric-identity');
 return codes;
}
export function validCorrectionWarnings(codes,collection,before,after){
 if(!Array.isArray(codes)||!Object.hasOwn(impact,collection))return false;
 const expected=correctionWarningCodes(collection,before,after);
 return codes.length===expected.length&&new Set(codes).size===codes.length&&codes.every(code=>expected.includes(code));
}
