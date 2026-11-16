import {reportNutrientDetailMessages} from './locales/report-nutrient-detail.js';
import {mobileNutrientDetailMessages} from './locales/mobile-nutrient-detail.js';
import {createMessageFormatter} from '../dashboard-source/message-formatter.js';
import {discoverMessages} from '../dashboard-source/locales/discover.js';
import {mobileReportMessages} from './locales/mobile-report.js';
import {energyReportMessages} from './locales/energy-report.js';
export const formatMessage=createMessageFormatter(Object.fromEntries(Object.keys(discoverMessages).map(language=>[language,{...discoverMessages[language],...mobileReportMessages[language],...energyReportMessages[language],...reportNutrientDetailMessages[language],...mobileNutrientDetailMessages[language]}])));
