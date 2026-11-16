import {measurementCatalogMessages} from './locales/measurement-catalog.js';
import {formatMessage} from './message-format.js';
// Catalog IDs and category values belong to the library; labels are presentation only.
const label=(language,key,fallback)=>Object.hasOwn(measurementCatalogMessages.en,key)?formatMessage(language,key):fallback;
export function biometricCatalogLabel(metric,language='en'){
 return metric.selection.kind==='catalog'?label(language,'measurementCatalog.metric.'+metric.selection.id,metric.label):metric.label;
}
export const biometricCategoryLabel=(category,language='en')=>label(language,'measurementCatalog.category.'+category,category);
export function biometricSearchText(metric,language='en'){
 return [biometricCatalogLabel(metric,language),metric.label,...metric.units,...metric.categories.map(category=>biometricCategoryLabel(category,language)),...metric.categories,metric.selection.type||''].join(' ').toLocaleLowerCase(language);
}
