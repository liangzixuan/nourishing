import {resolveScoreDisplay} from './domain/nutrition-score-policy.mjs';
import {nutrientDisplayOptions} from './domain/nutrient-display.mjs';
import {parseDiscoverSettings} from './domain/discover-settings.mjs';
import {captureFastingTiming} from './domain/fasting-view.mjs';

// Presentation metadata supplements calculateSummary; it never recalculates nutrition.
export function diarySummaryPresentation(state, summary, clock) {
 const source=state.settings??{},display=resolveScoreDisplay(source),discover=parseDiscoverSettings(source.discover);
 const settings=Object.fromEntries(['addMenu','showEnergy','showMacros','showWater','pauseLife','showTimestamp'].filter(key=>Object.hasOwn(source,key)).map(key=>[key,structuredClone(source[key])]));
 settings.showScores=display.show;
 const byId=new Map(summary.scores.map(score=>[score.id,score]));
 const asOf=(clock?.now??new Date()).toISOString();
 return {settings,scoreDisplay:display,nutrientOptions:nutrientDisplayOptions,scores:display.selected.map(id=>byId.get(id)).filter(Boolean),fasting:{visible:discover.fastingEnabled&&discover.fastingDiary,asOf,...captureFastingTiming(state,asOf)}};
}
