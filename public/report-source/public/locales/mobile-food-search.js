const rows={
 more:['Load more','Afficher plus','Mehr laden','Carregar mais'],
 offline:['Offline diary','Journal hors ligne','Offline-Tagebuch','Diário offline'],
 preferencesError:['Search options could not be saved.','Impossible d’enregistrer les options.','Suchoptionen konnten nicht gespeichert werden.','Não foi possível salvar as opções.'],
 search:['Search all foods…','Rechercher un aliment…','Lebensmittel suchen…','Buscar alimentos…'],
 options:['Food Search Options','Options de recherche','Suchoptionen','Opções de busca'],
 close:['Close','Fermer','Schließen','Fechar'],scan:['Scan barcode','Scanner un code-barres','Barcode scannen','Escanear código de barras'],
 all:['All','Tous','Alle','Todos'],favorites:['Favorites','Favoris','Favoriten','Favoritos'],custom:['Custom','Personnalisés','Eigene','Personalizados'],common:['Common','Courants','Allgemein','Comuns'],supplements:['Supplements','Compléments','Supplemente','Suplementos'],brands:['Brands','Marques','Marken','Marcas'],restaurants:['Restaurants','Restaurants','Restaurants','Restaurantes'],beverages:['Beverages','Boissons','Getränke','Bebidas'],
 tabs:['Category Tabs','Onglets de catégories','Kategorie-Tabs','Abas de categorias'],sort:['Sort by','Trier par','Sortieren nach','Ordenar por'],database:['Database','Base de données','Datenbank','Base de dados'],
 az:['A to Z','A à Z','A bis Z','A a Z'],za:['Z to A','Z à A','Z bis A','Z a A'],recent:['Most Recent','Plus récents','Zuletzt verwendet','Mais recentes'],frequent:['Most Frequent','Plus fréquents','Am häufigsten','Mais frequentes'],best:['Best Match','Meilleure correspondance','Beste Übereinstimmung','Melhor correspondência'],
 loading:['Searching…','Recherche…','Suche…','Buscando…'],empty:['No results','Aucun résultat','Keine Ergebnisse','Nenhum resultado'],retry:['Retry','Réessayer','Erneut versuchen','Tentar novamente'],
 food:['Custom Food','Aliment personnalisé','Eigenes Lebensmittel','Alimento personalizado'],recipe:['Custom Recipe','Recette personnalisée','Eigenes Rezept','Receita personalizada'],meal:['Custom Meal','Repas personnalisé','Eigene Mahlzeit','Refeição personalizada'],serving:['1 serving','1 portion','1 Portion','1 porção']
};
export const mobileSearchMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,i)=>[language,Object.fromEntries(Object.entries(rows).map(([key,values])=>['mobileSearch.'+key,values[i]]))]));
