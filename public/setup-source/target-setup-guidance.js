import {targetSetupGuidance} from '../report-source/server/target-setup-guidance.mjs';
import {formatMessage} from '../report-source/public/message-format.js';
export const targetSetupGuidanceText=(note,language='en')=>language==='en'||!Object.hasOwn(targetSetupGuidance,note.code)?note.text:formatMessage(language,'targetSetup.note.'+note.code);
