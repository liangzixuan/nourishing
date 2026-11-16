import {openSuggestions} from './suggestions.js';
import {openOracle} from './oracle.js';

export function openFoodInsights(options){
 return options.mode==='oracle'?openOracle(options):openSuggestions(options);
}
