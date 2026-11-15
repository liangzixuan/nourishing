import {nutrientLabels,nutrientGroupLabels} from './locales/nutrients.js';

/** Presentation only. Unknown identities retain their supplied source label. */
export function nutrientDisplayName(row,language='en'){
  const labels=nutrientLabels[language];
  return labels&&Object.hasOwn(labels,row.id)?labels[row.id]:row.name;
}
export function nutrientGroupName(group,language='en'){
  const labels=nutrientGroupLabels[language];
  return labels&&Object.hasOwn(labels,group)?labels[group]:group;
}
