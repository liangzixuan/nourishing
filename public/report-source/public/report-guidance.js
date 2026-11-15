import {reportGuidance} from './../server/report-guidance.mjs';
import {formatMessage} from './message-format.js';
export const reportNoteText=(note,language='en')=>language==='en'||!Object.hasOwn(reportGuidance,note.code)?note.text:formatMessage(language,'reportGuidance.'+note.code);
