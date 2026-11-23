import {diaryGroups} from './domain/diary-groups.mjs';
import {diaryQuickAddAction,parseDiaryQuickAdd} from './domain/diary-quick-add.mjs';
import {resolveScoreDisplay} from './domain/nutrition-score-policy.mjs';
import {nutrientDisplayOptions} from './domain/nutrient-display.mjs';
import {resolveWaterSettings} from './domain/water-settings.mjs';

// Presentation metadata supplements calculateSummary; it never recalculates nutrition.
export function diarySummaryPresentation(state, summary) {
 const source=state.settings??{},display=resolveScoreDisplay(source);
 const settings=Object.fromEntries(['appLanguage','fontScale','matchDeviceFontSize','addMenu','showEnergy','showMacros','showWater','pauseLife','showTimestamp'].filter(key=>Object.hasOwn(source,key)).map(key=>[key,structuredClone(source[key])]));
 settings.showScores=display.show;
 settings.waterSettings=resolveWaterSettings(source);
 const byId=new Map(summary.scores.map(score=>[score.id,score]));
 const quickAdd=source.diaryQuickAdd==null?null:parseDiaryQuickAdd(source.diaryQuickAdd,source.groups);
 return {settings,groupQuickAdd:Object.fromEntries(diaryGroups(source.groups).map(group=>[group,diaryQuickAddAction(quickAdd,group)])),scoreDisplay:display,nutrientOptions:nutrientDisplayOptions,scores:display.selected.map(id=>byId.get(id)).filter(Boolean)};
}
