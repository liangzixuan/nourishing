import {nutritionLabelErrorMessages} from './report-source/public/locales/nutrition-label-errors.js';
import {nutrientDisplayName} from './report-source/public/nutrient-language.js';
import {formatMessage} from './report-source/public/message-format.js';
/** Serialized tags from the canonical label owners; never infer a code from English text. */
export function labelErrorMessage(detail,locale){
 if(!detail||!['nutritionLabel','vitaminActivity'].includes(detail.kind)||typeof detail.code!=='string')return;
 const key=(detail.kind==='vitaminActivity'?'vitamin.':'')+detail.code,known=key=>Object.hasOwn(nutritionLabelErrorMessages.en,'nutritionLabelErrors.'+key);
 if(!known(key))return;
 const message=(key,values)=>formatMessage(locale,'nutritionLabelErrors.'+key,values),d=detail.details??{},values={};
 if(d.nutrientId){if(typeof d.nutrientId!=='string')return;values.name=known('row.'+d.nutrientId)?message('row.'+d.nutrientId):nutrientDisplayName({id:d.nutrientId,name:d.nutrientId},locale);}
 else if(d.field){if(typeof d.field!=='string'||!known('field.'+d.field))return;values.name=message('field.'+d.field);}
 if(d.percent)values.name=message('percent',{name:values.name});
 if(d.profileId){if(typeof d.profileId!=='string'||!known('population.'+d.profileId))return;values.population=message('population.'+d.profileId);}
 for(const field of ['min','max'])if(d[field]!==undefined){if(!Number.isFinite(d[field]))return;values[field]=new Intl.NumberFormat(locale,{maximumSignificantDigits:21}).format(d[field]);}
 return message(key,values);
}
