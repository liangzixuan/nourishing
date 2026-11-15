import {DiaryRecordError,isDiaryRecordErrorCapture} from './../server/diary-record-errors.mjs';
import {formatMessage} from './../../report-source/public/message-format.js';
export {DiaryRecordError};
export function diaryRecordErrorText(error,language='en'){return error instanceof DiaryRecordError?formatMessage(language,'diaryRecordErrors.'+error.diaryRecordCode):error?.message||String(error);}
export function diaryRecordFailureText(result,language='en',fallback=result?.error){return isDiaryRecordErrorCapture(result?.diaryRecordError)?formatMessage(language,'diaryRecordErrors.'+result.diaryRecordError.code):fallback;}
