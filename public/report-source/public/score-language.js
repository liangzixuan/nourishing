import {scoreGroupLabels,scoreLabelKinds} from './locales/scores.js';
import {formatMessage} from './message-format.js';

export function scoreGroupName(id,fallback,language='en'){
 const labels=scoreGroupLabels[language];
 return labels&&Object.hasOwn(labels,id)?labels[id]:fallback;
}
export function scoreDisplayName(row,language='en'){
 const name=scoreGroupName(row.id,null,language);
 if(name===null||!Object.hasOwn(scoreLabelKinds,row.id))return row.name;
 const kind=scoreLabelKinds[row.id];
 return kind==='plain'?name:formatMessage(language,'scoreLabel.'+kind,{name});
}
