import {balanceGuidance,isBalanceGuidance} from './../server/balance-guidance.mjs';
import {formatMessage} from './message-format.js';
export function balanceNoteText(note,language='en'){
 if(!isBalanceGuidance(note))throw Error('Incomplete nutrient balance explanation.');
 return language==='en'||!Object.hasOwn(balanceGuidance,note.code)?note.text:formatMessage(language,'balanceGuidance.'+note.code);
}
export function calciumCoefficientText(formula,language='en'){
 if(!formula||typeof formula.coefficientDiscrepancy!=='string')throw Error('Incomplete calcium formula explanation.');
 return language==='en'||formula.id!=='cronometer-calcium-absorption-manual-0.0946'?formula.coefficientDiscrepancy:formatMessage(language,'balanceGuidance.coefficient');
}
