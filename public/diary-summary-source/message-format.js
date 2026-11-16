import {createMessageFormatter} from '../dashboard-source/message-formatter.js';
import {mobileDisplayMessages} from './locales/mobile-display.js';
import {mobileDiaryMessages} from './locales/mobile-diary.js';
import {mobileScoreDetailMessages} from './locales/mobile-score-detail.js';
import {mobileScoreMessages as mobileScoreSettingsMessages} from './locales/mobile-score-settings.js';
export const formatMessage=createMessageFormatter(Object.fromEntries(Object.keys(mobileDisplayMessages).map(language=>[language,{...mobileDisplayMessages[language],...mobileDiaryMessages[language],...mobileScoreDetailMessages[language],...mobileScoreSettingsMessages[language]}])));
