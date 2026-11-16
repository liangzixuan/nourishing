import {createMessageFormatter} from '../dashboard-source/message-formatter.js';
import {mobileTargetMessages} from './messages-mobile-targets.js';
import {mobileNutrientTargetMessages} from './messages-mobile-nutrient-targets.js';
export const formatMessage=createMessageFormatter(Object.fromEntries(Object.keys(mobileTargetMessages).map(language=>[language,{...mobileTargetMessages[language],...mobileNutrientTargetMessages[language]}])));
