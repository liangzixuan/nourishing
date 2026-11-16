import {createMessageFormatter} from '../dashboard-source/message-formatter.js';
import {mobilePhotoMessages} from './mobile-photo-messages.js';
import {mobileDisplayMessages} from '../diary-summary-source/locales/mobile-display.js';
export const formatMessage=createMessageFormatter(Object.fromEntries(Object.keys(mobilePhotoMessages).map(language=>[language,{...mobileDisplayMessages[language],...mobilePhotoMessages[language]}])));
