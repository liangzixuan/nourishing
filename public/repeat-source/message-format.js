import {createMessageFormatter} from '../dashboard-source/message-formatter.js';
import {mobileRepeatMessages} from './mobile-repeats-messages.js';
import {repeatMessages} from './repeat-messages.js';
import {quantityMessages} from './quantity-messages.js';
export const formatMessage=createMessageFormatter(Object.fromEntries(Object.keys(mobileRepeatMessages).map(language=>[language,{...mobileRepeatMessages[language],...repeatMessages[language],...quantityMessages[language],'common.save':{en:'Save',fr:'Enregistrer',de:'Speichern','pt-BR':'Salvar'}[language]}])));
