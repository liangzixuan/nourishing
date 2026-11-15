import {captureErrorMessages} from './locales/capture-errors.js';
import {formatMessage} from './message-format.js';
export class CaptureValidationError extends Error{
 constructor(code){const key='captureErrors.'+code;if(!Object.hasOwn(captureErrorMessages.en,key))throw new RangeError('Unknown capture-validation error identity.');super(captureErrorMessages.en[key]);this.captureCode=code;}
}
export function captureValidationErrorText(error,language='en'){
 return error instanceof CaptureValidationError&&Object.hasOwn(captureErrorMessages.en,'captureErrors.'+error.captureCode)?formatMessage(language,'captureErrors.'+error.captureCode):error?.message||String(error);
}
