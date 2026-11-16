import {formatMessage} from './message-format.js';
export function searchSource(row,language){
 const kind=row.kind==='recipes'?'recipe':row.kind==='meals'?'meal':'food';
 return {label:row.sourceType==='custom'?formatMessage(language,'mobileSearch.'+kind):row.sourceType==='open-food-facts'?'Open Food Facts':row.sourceType.toUpperCase(),className:row.sourceType==='custom'?'mfs-'+kind:'',detail:row.source?.dataset||row.source?.name||''};
}
