import {formatMessage} from './message-format.js';
import {nutrientDisplayName} from './nutrient-language.js';
import {balanceDisplayName} from './nutrient-balance-view.js';
import {balanceNoteText,calciumCoefficientText} from './balance-guidance.js';
const element=(html,tag,text)=>{html.raw('<'+tag+'>');html.text(text);html.raw('</'+tag+'>');};
const cell=(html,text)=>element(html,'td',text);
function source(html,label,url){html.raw('<p class="balance-print-sources">');html.text(label+': '+url);html.raw('</p>');}
/** Append only the validated captured balance section to the bounded print writer. */
export function appendBalancePrint(html,view,{language='en'}={}){
 const t=(key,values)=>formatMessage(language,'balancePrint.'+key,values),b=(key,values)=>formatMessage(language,'balance.'+key,values),number=value=>value===null?b('unknown'):String(value);
 function inputs(rows,pral){
  html.raw('<table class="balance-print-inputs"><thead><tr>');for(const key of ['input','inputMean','unit'])element(html,'th',t(key));html.raw('<th>');html.text(t('coverageHeading'));if(pral){html.raw('<br>');html.text(t('coefficientHeading'));}html.raw('</th></tr></thead><tbody>');
  for(const row of rows){html.raw('<tr>');element(html,'th',nutrientDisplayName(row,language));cell(html,number(row.value));cell(html,row.unit);html.raw('<td>');html.text(t('coverage',{known:row.coverage.known,total:row.coverage.total,status:t(row.coverage.complete?'complete':'incomplete')}));element(html,'small',b('status.'+row.status));if(pral)element(html,'small',t('contribution',{coefficient:number(row.coefficient),value:number(row.contribution)}));html.raw('</td></tr>');}html.raw('</tbody></table>');
 }
 const hidden=new Set(view.policy?.hidden??[]),rows=[...view.pairs,view.pral,view.calciumAbsorption].filter(row=>!hidden.has(row.id));html.raw('<section class="balance-print" data-print-balances>');element(html,'h2',t('title'));
 if(!rows.length){html.raw('<p class="empty" data-print-balances-empty>');html.text(t('hidden'));html.raw('</p></section>');return;}
 const methods=['method'];if(rows.some(row=>!['pral','calcium-absorption'].includes(row.id)))methods.push('ratios');if(rows.some(row=>row.id==='pral'))methods.push('pralMean');if(rows.some(row=>row.id!=='calcium-absorption'))methods.push('zeros');if(rows.some(row=>row.id==='calcium-absorption'))methods.push('calciumMean');html.raw('<p class="balance-print-method">');html.text(methods.map(key=>t(key)).join(' '));html.raw('</p>');
 for(const row of rows){const calcium=row.id==='calcium-absorption',pral=row.id==='pral';html.raw('<article class="balance-print-card" data-print-balance="');html.text(row.id);html.raw('"><div class="balance-print-heading">');element(html,'h3',language==='en'?row.label:balanceDisplayName(row,language));html.raw('<p class="balance-print-value" data-print-balance-value>');html.text(row.value===null?b('unavailable'):number(row.value)+(calcium?' mg':pral?' '+row.unit:' : 1 ('+t('dimensionless')+')'));html.raw('</p>');element(html,'p',calcium?t(row.reason===null?'calciumAccepted':'calciumUnavailable'):t(row.reason===null?(pral?'pral':'ratio'):'reason.'+row.reason));html.raw('<p data-print-balance-days>');html.text(t(calcium?'calciumDays':'days',row.days));html.raw('</p></div>');
  if(calcium){html.raw('<p data-print-calcium-fraction>');html.text(t('fractions',{fraction:number(row.fraction),raw:number(row.rawFraction)}));html.raw('</p><p class="balance-print-formula" data-print-calcium-formula>');html.text(row.formula.expression);html.raw('</p>');element(html,'p',calciumCoefficientText(row.formula,language));inputs(row.inputs,false);html.raw('<div data-print-calcium-limitations>');for(const note of row.limitations)element(html,'p',balanceNoteText(note,language));html.raw('</div>');source(html,t('publishedFormula'),row.formula.sourceUrl);source(html,b('citedResearch'),row.formula.researchUrl);}
  else if(pral){html.raw('<p class="balance-print-formula" data-print-pral-formula>');html.text(row.formula.expression);html.raw('</p>');element(html,'p',b('pralLimit'));inputs(row.inputs,true);source(html,t('formulaSource'),row.formula.sourceUrl);source(html,b('researchLink'),row.formula.researchUrl);}
  else{const ref=row.reference;html.raw('<p data-print-balance-reference>');html.text(b('reference')+' ');if(ref.high===null)html.text(b(ref.lowInclusive?'atLeast':'greater',{value:number(ref.low)})+'. '+t(ref.lowInclusive?'equalityIncluded':'equalityExcluded'));else html.text(number(ref.low)+'–'+number(ref.high)+' : 1. '+b(ref.lowInclusive?'bothIncluded':'openLower'));html.text(' '+b(ref.status==='unknown'?'comparisonUnknown':'range.'+ref.status));html.raw('</p>');element(html,'p',b('referenceLimit'));inputs([row.numerator,row.denominator],false);source(html,t('referenceSource'),ref.sourceUrl);}
  html.raw('</article>');
 }
 html.raw('</section>');
}
