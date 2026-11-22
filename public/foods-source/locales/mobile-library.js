const rows={
 exampleMeal:['Weekday breakfast','Petit-déjeuner de semaine','Frühstück unter der Woche','Café da manhã durante a semana'],
 mealTip:['Diary tip','Conseil pour le journal','Tagebuch-Tipp','Dica do diário'],
 mealTipText:['Swipe right on a meal in the Diary to adjust its ingredients or split it into separate entries.','Dans le journal, balayez un repas vers la droite pour ajuster ses ingrédients ou le diviser en entrées distinctes.','Wische auf einer Mahlzeit im Tagebuch nach rechts, um die Zutaten anzupassen oder einzeln einzutragen.','No diário, deslize a refeição para a direita para ajustar os ingredientes ou dividi-la em registros separados.'],
 dismissTip:['Dismiss tip','Masquer le conseil','Tipp schließen','Dispensar dica'],
 'empty.foods':['No Foods','Aucun aliment','Keine Lebensmittel','Nenhum alimento'],
 'empty.recipes':['No Recipes','Aucune recette','Keine Rezepte','Nenhuma receita'],
 'empty.meals':['Create a Meal','Créer un repas','Eine Mahlzeit erstellen','Criar uma refeição'],
 'emptyHelp.foods':['Custom foods you create will appear here.','Les aliments que vous créez apparaîtront ici.','Selbst erstellte Lebensmittel erscheinen hier.','Os alimentos que você criar aparecerão aqui.'],
 'emptyHelp.recipes':['Recipes you create or import will appear here.','Les recettes que vous créez ou importez apparaîtront ici.','Selbst erstellte und importierte Rezepte erscheinen hier.','As receitas que você criar ou importar aparecerão aqui.'],
 'emptyHelp.meals':['Combine foods you often eat together so you can log them as one meal.','Regroupez les aliments que vous mangez souvent ensemble pour les enregistrer en un seul repas.','Fasse Lebensmittel, die du oft zusammen isst, zu einer Mahlzeit zusammen.','Combine alimentos que costuma comer juntos para registrá-los como uma só refeição.'],
 search:['Search…','Rechercher…','Suchen…','Pesquisar…'],recent:['Most Recent','Plus récents','Neueste zuerst','Mais recentes'],alphabetical:['Alphabetical','Alphabétique','Alphabetisch','Ordem alfabética'],options:['Library options','Options de la bibliothèque','Bibliotheksoptionen','Opções da biblioteca'],actions:['Actions','Actions','Aktionen','Ações'],more:['More actions','Autres actions','Weitere Aktionen','Mais ações'],
 'count.foods.one':['{{count}} Food','{{count}} aliment','{{count}} Lebensmittel','{{count}} alimento'],'count.foods.other':['{{count}} Foods','{{count}} aliments','{{count}} Lebensmittel','{{count}} alimentos'],
 'count.recipes.one':['{{count}} Recipe','{{count}} recette','{{count}} Rezept','{{count}} receita'],'count.recipes.other':['{{count}} Recipes','{{count}} recettes','{{count}} Rezepte','{{count}} receitas'],
 'count.meals.one':['{{count}} Meal','{{count}} repas','{{count}} Mahlzeit','{{count}} refeição'],'count.meals.other':['{{count}} Meals','{{count}} repas','{{count}} Mahlzeiten','{{count}} refeições']
};
export const mobileLibraryMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,i)=>[language,Object.fromEntries(Object.entries(rows).map(([key,values])=>['mobileLibrary.'+key,values[i]]))]));
