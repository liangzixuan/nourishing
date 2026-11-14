import {contentDigest} from './content-digest.mjs';
import {foodWithoutClassification} from './food-classification.mjs';
import {parseCarbohydrateBasis} from './carbohydrate-policy.mjs';
import {catalogIdentity,sourceLocatorMatches} from './catalog-source.mjs';
export function catalogSourceId(food){
  const identity=catalogIdentity(food?.source);
  if(!identity)throw Object.assign(Error('Catalog food identity does not match its source.'),{status:400});
  return identity.id;
}
export function foodSourceFacts(food) {
  parseCarbohydrateBasis(food);
  const {id, carbohydrateBasis, ...facts} = foodWithoutClassification(food);
  return facts;
}
export function catalogSnapshotId(food){
  catalogSourceId(food);
  return `${catalogIdentity(food.source).provider}-snapshot:`+contentDigest(foodSourceFacts(food));
}

export function customCatalogSource(source){
  const catalog=sourceLocatorMatches(source)&&/^[a-f0-9]{64}$/i.test(source.archiveSha256??'');
  return catalog?{name:'Custom food based on '+source.name,userModified:true,originalSource:source}:source;
}
