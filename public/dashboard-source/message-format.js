// Compose only the original catalogs used by the migrated Dashboard renderers.
import {createMessageFormatter} from './message-formatter.js';
import {discoverMessages} from './locales/discover.js';
import {sleepMessages} from './locales/sleep.js';
export const formatMessage=createMessageFormatter(Object.fromEntries(Object.keys(discoverMessages).map(language=>[language,{...discoverMessages[language],...sleepMessages[language]}])));
