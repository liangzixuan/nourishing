import {escape as e} from '../html.js';
import {t} from '../app-language.js';
import {fc} from '../food-cloud-messages.js';
import {LibraryReviewDialog} from '../targets-source/library-review-dialog.js';

export function compositeHeader(kind,saved){
 const recipe=kind==='recipe',title=fc(saved?(recipe?'editRecipe':'editMeal'):(recipe?'createRecipe':'createMeal'));
 const options=recipe?fc('recipeOptions'):t('mobileSuggest.mealOptions');
 return `<header class="sheet-header"><button type="button" class="icon-button" data-${kind}-close aria-label="${e(t('common.close'))}">×</button><h2>${e(title)}</h2><div class="mce-header-actions"><button type="button" data-mce-help aria-label="${e(t('mobileCompositeEditor.manual'))}">?</button>${saved?`<button type="button" data-${kind}-menu aria-label="${e(options)}">⋮</button>`:''}</div></header>`;
}
export function compositeHelp(topic,onClose){
 const servings=topic==='servings';
 const dialog=new LibraryReviewDialog({title:t('mobileCompositeEditor.'+(servings?'advancedServings':'manual')),closeLabel:t('common.close'),loading:'',onClose});
 if(servings)dialog.root.classList.add('recipe-message');
 dialog.show(`<p>${e(t('mobileCompositeEditor.'+topic+'Guide'))}</p>`);
 return dialog;
}
