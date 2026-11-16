import {createMessageFormatter} from '../report-source/public/message-formatter.js';
import {mobileSearchMessages} from '../report-source/public/locales/mobile-food-search.js';

// Search only loads its own translations, including when embedded in child flows.
export const formatMessage=createMessageFormatter(mobileSearchMessages);
