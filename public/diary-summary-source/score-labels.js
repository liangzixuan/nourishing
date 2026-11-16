import {formatMessage} from './message-format.js';
const diary=new Set(['overall','vitamins','minerals','electrolytes','immune','antioxidants','bone','metabolism']);
const extra=new Set(['blood','oral','dataQuality','keto','plant','womens','mens','calciumAbsorption']);
export const scoreName=row=>diary.has(row.id)?formatMessage('en','mobileDiary.'+row.id):extra.has(row.id)?formatMessage('en','mobileScoreSettings.'+row.id):row.name;
