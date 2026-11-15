import {scoreReportGuidance,isScoreReportGuidance} from './../server/score-report-guidance.mjs';
import {formatMessage} from './message-format.js';
export function scoreReportGuidanceText(capture,language='en'){
 if(!isScoreReportGuidance(capture))throw new TypeError('Incomplete captured score guidance.');
 return language==='en'||!Object.hasOwn(scoreReportGuidance,capture.code)?capture.text:formatMessage(language,'scoreGuidance.'+capture.code);
}
