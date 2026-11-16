import {createMessageFormatter} from '../dashboard-source/message-formatter.js';
import {mobileFoodsMessages} from './locales/mobile-foods-home.js';
import {mobileLibraryMessages} from './locales/mobile-library.js';
import {libraryViewMessages} from './locales/library-view.js';
import {libraryLifecycleMessages} from './locales/library-lifecycle.js';
export const formatMessage=createMessageFormatter(Object.fromEntries(Object.keys(mobileFoodsMessages).map(language=>[language,{...mobileFoodsMessages[language],...mobileLibraryMessages[language],...libraryViewMessages[language],...libraryLifecycleMessages[language]}])));
