import {accountMessage} from './account-cloud-messages.js';
import {uiLanguage,t} from './app-language.js';
import {requestErrorMessage} from './request-error.js';
// Stable UI error keys travel separately from any retained English evidence.
export function offlineFailure(code){const messageKey='accountCloud.offlineError.'+code;return Object.assign(Error(accountMessage(messageKey,{},'en')),{messageKey});}
export function offlineErrorMessage(error,language=uiLanguage()){
 if(error?.messageKey)return accountMessage(error.messageKey,{},language);
 if(error?.diaryRecordCode)return t('diaryRecordErrors.'+error.diaryRecordCode,{},language);
 return requestErrorMessage({error:error?.message??error?.error,errorCode:error?.errorCode},error?.status??error?.errorStatus??400,language);
}
