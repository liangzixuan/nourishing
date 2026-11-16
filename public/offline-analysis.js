import {resolveScoreDisplay} from './report-source/server/nutrition-score-policy.mjs';
import {scoreDisplayName} from './report-source/public/score-language.js';
import {scoreMethodDescription} from './report-source/public/score-method-language.js';
import {validateDataCompleteness,renderDataCompleteness,formatCompleteness} from './report-source/public/data-completeness.js';
import {renderNutrientBalanceCards} from './report-source/public/nutrient-balance-view.js';
import {offlineMessage} from './offline-language.js';
import {escape as e} from './html.js';

// Scores and completeness describe the full day; only balances follow selection.
export function renderOfflineAnalysis(summary,captured,settings,language='en'){
 const t=(key,values)=>offlineMessage(language,'offlineAnalysis.'+key,values),display=resolveScoreDisplay(settings);
 const scores=display.show?`<details data-offline-panel="scores"><summary>${e(t('scores'))}</summary><small>${e(offlineMessage(language,'offlineDiary.day'))} · ${e(summary.date)}</small><div class="offline-score-grid">${display.selected.map(id=>{
  const score=summary.scores.find(row=>row.id===id),name=scoreDisplayName(score,language);
  return `<article data-offline-score="${e(id)}"><h3>${e(name)}</h3><strong data-score-value="${score.value??''}">${score.value===null?e(offlineMessage(language,'completeness.unknown')):e(score.value)+' / 100'}</strong><small>${e(t('coverage',{known:score.coverage.known,total:score.coverage.total}))}${score.coverage.complete?'':e(t('partial'))}</small><details><summary>${e(t('calculation',{name}))}</summary><p>${e(scoreMethodDescription(score,language))}</p></details></article>`;
 }).join('')}</div></details>`:'';
 const complete=validateDataCompleteness(summary.dataCompleteness,{date:summary.date});
 const completeness=`<details data-offline-panel="completeness"><summary>${e(t('completeness'))} · <strong data-offline-completeness-value>${e(formatCompleteness(complete.overall.percent,language))}</strong></summary>${renderDataCompleteness(complete,{language})}</details>`;
 const scope=captured.scope==='selection'?offlineMessage(language,'offlineDiary.selected',{count:captured.selectedCount}):offlineMessage(language,'offlineDiary.day');
 const balances=`<details data-offline-panel="balances"><summary>${e(t('balances'))}</summary>${renderNutrientBalanceCards(captured.balances,{language,scopeLabel:scope+' · '+summary.date})}</details>`;
 return `<section class="offline-analysis">${scores}${completeness}${balances}</section>`;
}
