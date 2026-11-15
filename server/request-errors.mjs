export function invalid(message){throw Object.assign(Error(message),{code:400,publicMessage:message});}
