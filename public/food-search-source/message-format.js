import {createMessageFormatter} from '../report-source/public/message-formatter.js';
import {mobileSearchMessages} from '../report-source/public/locales/mobile-food-search.js';

import {multiAddMessages} from './food-multi-add-messages.js';
export const formatMessage=createMessageFormatter(Object.fromEntries(Object.keys(mobileSearchMessages).map(language=>[language,{...mobileSearchMessages[language],...multiAddMessages[language]}])));
