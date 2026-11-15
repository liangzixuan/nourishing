import {withoutMeasureTranslations} from './measure-translations.mjs';
import {parseLibraryStatus} from './library-status.mjs';
import {parseFoodTaxonomy} from './food-taxonomy.mjs';
import {parseFoodClassification} from './food-classification.mjs';
import {parseFoodNotes} from './food-notes.mjs';
import {parseFoodTranslations} from './food-translations.mjs';
/** These reviewed display annotations do not change a pending quantity or its
 * nutrition. Serving labels, weights, carbohydrate basis and source facts do. */
export function offlineFoodVersionFacts(food){
 parseFoodClassification(food);parseFoodNotes(food);parseFoodTranslations(food);parseFoodTaxonomy(food);parseLibraryStatus(food);
 const {classification,notes,translations,categoryId,tags,retired,...facts}=food;return withoutMeasureTranslations(facts);
}
