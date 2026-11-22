const rows={
 back:['Back','Retour','Zurück','Voltar'],
 moreOptions:['More options','Plus d’options','Weitere Optionen','Mais opções'],
 exampleMeal:['Weekday Breakfast','Petit-déjeuner de semaine','Frühstück unter der Woche','Café da manhã durante a semana'],
 mealTip:['Nourishing Tips','Conseils Nourishing','Nourishing-Tipps','Dicas do Nourishing'],
 mealTipText:['Swipe right on a Meal in your Diary and “Adjust” or “Explode” it if you need to edit what you consumed that day.','Dans votre journal, balayez un repas vers la droite et choisissez d’ajuster ou de décomposer le repas pour modifier ce que vous avez consommé ce jour-là.','Wische im Tagebuch auf einer Mahlzeit nach rechts und wähle „Anpassen“ oder „Aufteilen“, um deinen Verzehr für diesen Tag zu bearbeiten.','Deslize uma refeição para a direita no diário e escolha ajustar ou separar para editar o que você consumiu naquele dia.'],
 dismissTip:['Dismiss tip','Masquer le conseil','Tipp schließen','Dispensar dica'],
 'empty.foods':['No Foods','Aucun aliment','Keine Lebensmittel','Nenhum alimento'],
 'empty.recipes':['No Recipes','Aucune recette','Keine Rezepte','Nenhuma receita'],
 'empty.meals':['Create a Meal','Créer un repas','Eine Mahlzeit erstellen','Criar uma refeição'],
 'emptyHelp.foods':['Custom foods that you create\nwill appear here','Les aliments que vous créez apparaîtront ici','Selbst erstellte Lebensmittel erscheinen hier','Os alimentos que você criar aparecerão aqui'],
 'emptyHelp.recipes':['Custom recipes that you create\nor import will appear here','Les recettes que vous créez ou importez apparaîtront ici','Selbst erstellte und importierte Rezepte erscheinen hier','As receitas que você criar ou importar aparecerão aqui'],
 'emptyHelp.meals':['Save time logging your meals! Combine frequently consumed items into Meals for more efficient tracking.','Gagnez du temps en regroupant dans un repas les aliments que vous consommez souvent ensemble.','Spare Zeit beim Eintragen, indem du häufig verzehrte Lebensmittel zu Mahlzeiten zusammenfasst.','Poupe tempo ao registrar suas refeições! Combine os alimentos que consome com frequência em uma refeição.'],
 search:['Search…','Rechercher…','Suchen…','Pesquisar…'],recent:['Most Recent','Plus récents','Neueste zuerst','Mais recentes'],alphabetical:['Alphabetical','Alphabétique','Alphabetisch','Ordem alfabética'],options:['Library options','Options de la bibliothèque','Bibliotheksoptionen','Opções da biblioteca'],actions:['Actions','Actions','Aktionen','Ações'],more:['More actions','Autres actions','Weitere Aktionen','Mais ações'],
 'count.foods.one':['{{count}} Food','{{count}} aliment','{{count}} Lebensmittel','{{count}} alimento'],'count.foods.other':['{{count}} Foods','{{count}} aliments','{{count}} Lebensmittel','{{count}} alimentos'],
 'count.recipes.one':['{{count}} Recipe','{{count}} recette','{{count}} Rezept','{{count}} receita'],'count.recipes.other':['{{count}} Recipes','{{count}} recettes','{{count}} Rezepte','{{count}} receitas'],
 'count.meals.one':['{{count}} Meal','{{count}} repas','{{count}} Mahlzeit','{{count}} refeição'],'count.meals.other':['{{count}} Meals','{{count}} repas','{{count}} Mahlzeiten','{{count}} refeições']
};
export const mobileLibraryMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,i)=>[language,Object.fromEntries(Object.entries(rows).map(([key,values])=>['mobileLibrary.'+key,values[i]]))]));
