import {uiLanguage} from './app-language.js';
import {coreCloudMessages,coreText} from './core-cloud-messages.js';
import {labelErrorMessage} from './label-error-message.js';
const statuses={400:'request.invalid',401:'auth.required',403:'request.forbidden',404:'request.notFound',409:'request.conflict',413:'request.tooLarge',415:'request.unsupportedMedia',429:'request.rateLimited'};
export function requestErrorMessage(result,status,locale=uiLanguage()){
 // English server details are already presentation text. Other locales use
 // declared codes, never sentence matching or substitution of user values.
 if(locale==='en'&&typeof result?.error==='string'&&result.error)return result.error;
 const detail=labelErrorMessage(result?.errorDetail,locale);if(detail)return detail;
 const code=Object.hasOwn(coreCloudMessages.en,result?.errorCode)?result.errorCode:statuses[status]??(status>=500?'request.unavailable':'request.failed');
 return coreText(code,{},locale);
}
