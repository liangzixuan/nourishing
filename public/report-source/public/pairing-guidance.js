import {pairingGuidance} from './../server/pairing-guidance.mjs';
import {formatMessage} from './message-format.js';
export const pairingNoteText=(note,language='en')=>language==='en'||!Object.hasOwn(pairingGuidance,note.code)?note.text:formatMessage(language,'pairingGuidance.'+note.code);
