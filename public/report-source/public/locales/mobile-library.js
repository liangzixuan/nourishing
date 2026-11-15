const rows={
 search:['Search…','Rechercher…','Suchen…','Pesquisar…'],recent:['Most Recent','Plus récents','Neueste zuerst','Mais recentes'],alphabetical:['Alphabetical','Alphabétique','Alphabetisch','Ordem alfabética'],options:['Library options','Options de la bibliothèque','Bibliotheksoptionen','Opções da biblioteca'],actions:['Actions','Actions','Aktionen','Ações'],more:['More actions','Autres actions','Weitere Aktionen','Mais ações'],
 'count.foods.one':['{{count}} Food','{{count}} aliment','{{count}} Lebensmittel','{{count}} alimento'],'count.foods.other':['{{count}} Foods','{{count}} aliments','{{count}} Lebensmittel','{{count}} alimentos'],
 'count.recipes.one':['{{count}} Recipe','{{count}} recette','{{count}} Rezept','{{count}} receita'],'count.recipes.other':['{{count}} Recipes','{{count}} recettes','{{count}} Rezepte','{{count}} receitas'],
 'count.meals.one':['{{count}} Meal','{{count}} repas','{{count}} Mahlzeit','{{count}} refeição'],'count.meals.other':['{{count}} Meals','{{count}} repas','{{count}} Mahlzeiten','{{count}} refeições']
};
export const mobileLibraryMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,i)=>[language,Object.fromEntries(Object.entries(rows).map(([key,values])=>['mobileLibrary.'+key,values[i]]))]));
