const rows={
 searchCategories:['Search categories','Rechercher des catégories','Kategorien suchen','Pesquisar categorias'],
 searchFoods:['Search foods','Rechercher des aliments','Lebensmittel suchen','Pesquisar alimentos'],
 backResults:["Back to results","Retour aux résultats","Zurück zu Ergebnissen","Voltar aos resultados"],
 title:['Ask the Oracle','Demander à Oracle','Oracle fragen','Pergunte ao Oracle'],
 newSearch:['New Search','Nouvelle recherche','Neue Suche','Nova pesquisa'],
 nutrient:['Nutrient','Nutriment','Nährstoff','Nutriente'],rankedBy:['Ranked By','Classement','Sortierung','Ordenar por'],
 oracle:['The Oracle',"L’oracle",'Das Orakel','O Oráculo'],
 details:['Food details','Détails de l’aliment','Lebensmitteldetails','Detalhes do alimento'],
 gram:['Highest Per Gram','Le plus par gramme','Höchster Wert pro Gramm','Maior por grama'],calorie:['Highest Per Calorie','Le plus par calorie','Höchster Wert pro Kalorie','Maior por caloria'],portion:['Published Serving','Portion publiée','Veröffentlichte Portion','Porção publicada'],
 all:['Search all categories','Toutes les catégories','Alle Kategorien','Todas as categorias'],categories:['Select Search Categories','Choisir les catégories','Kategorien auswählen','Selecionar categorias'],categoryTitle:['Search Categories','Catégories','Suchkategorien','Categorias de pesquisa'],
 search:['Search','Rechercher','Suchen','Pesquisar'],results:['Oracle Results','Résultats Oracle','Oracle-Ergebnisse','Resultados Oracle'],target:['Daily Target','Objectif quotidien','Tagesziel','Meta diária'],
 rank:['Rank','Rang','Rang','Posição'],description:['Description','Description','Beschreibung','Descrição'],loading:['Loading…','Chargement…','Lädt…','Carregando…'],empty:['No matching foods','Aucun aliment trouvé','Keine passenden Lebensmittel','Nenhum alimento encontrado'],
 close:['Close','Fermer','Schließen','Fechar'],back:['Back to Foods','Retour aux aliments','Zurück zu Lebensmitteln','Voltar aos alimentos'],help:['About nutrient rankings','À propos des classements','Über Nährstoff-Ranglisten','Sobre as classificações'],
 helpText:['The Oracle combines the nutrient per gram and per calorie. For equal scores, your favorites come first, followed by foods you log more often.','L’oracle combine les teneurs par gramme et par calorie. À score égal, vos favoris passent en premier, puis les aliments que vous consignez le plus souvent.','Das Orakel kombiniert den Nährstoffgehalt pro Gramm und pro Kalorie. Bei gleichem Ergebnis kommen zuerst deine Favoriten, dann die häufiger protokollierten Lebensmittel.','O Oráculo combina o teor do nutriente por grama e por caloria. Em caso de empate, seus favoritos vêm primeiro, seguidos dos alimentos que você registra com mais frequência.'],
 unknown:['Unknown','Inconnu','Unbekannt','Desconhecido'],uncategorized:['Uncategorized','Sans catégorie','Ohne Kategorie','Sem categoria'],include:['Include selected','Inclure la sélection','Einschließen','Incluir selecionadas'],exclude:['Exclude selected','Exclure la sélection','Ausschließen','Excluir selecionadas'],more:['Load more','Voir plus','Mehr laden','Carregar mais'],retry:['Retry','Réessayer','Erneut versuchen','Tentar novamente'],filter:['Filter foods','Filtrer les aliments','Lebensmittel filtern','Filtrar alimentos']
};
export const mobileOracleMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,i)=>[language,Object.fromEntries(Object.entries(rows).map(([key,values])=>['mobileOracle.'+key,values[i]]))]));
