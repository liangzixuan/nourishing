const rows={
 backResults:["Back to results","Retour aux résultats","Zurück zu Ergebnissen","Voltar aos resultados"],
 title:['Ask the Oracle','Demander à Oracle','Oracle fragen','Pergunte ao Oracle'],
 newSearch:['New Search','Nouvelle recherche','Neue Suche','Nova pesquisa'],
 nutrient:['Nutrient','Nutriment','Nährstoff','Nutriente'],rankedBy:['Ranked By','Classement','Sortierung','Ordenar por'],
 gram:['Highest Per Gram','Le plus par gramme','Höchster Wert pro Gramm','Maior por grama'],calorie:['Highest Per Calorie','Le plus par calorie','Höchster Wert pro Kalorie','Maior por caloria'],portion:['Published Serving','Portion publiée','Veröffentlichte Portion','Porção publicada'],
 all:['Search all categories','Toutes les catégories','Alle Kategorien','Todas as categorias'],categories:['Select Search Categories','Choisir les catégories','Kategorien auswählen','Selecionar categorias'],categoryTitle:['Search Categories','Catégories','Suchkategorien','Categorias de pesquisa'],
 search:['Search','Rechercher','Suchen','Pesquisar'],results:['Oracle Results','Résultats Oracle','Oracle-Ergebnisse','Resultados Oracle'],target:['Daily Target','Objectif quotidien','Tagesziel','Meta diária'],
 rank:['Rank','Rang','Rang','Posição'],description:['Description','Description','Beschreibung','Descrição'],loading:['Loading…','Chargement…','Lädt…','Carregando…'],empty:['No matching foods','Aucun aliment trouvé','Keine passenden Lebensmittel','Nenhum alimento encontrado'],
 close:['Close','Fermer','Schließen','Fechar'],back:['Back to Foods','Retour aux aliments','Zurück zu Lebensmitteln','Voltar aos alimentos'],help:['About nutrient rankings','À propos des classements','Über Nährstoff-Ranglisten','Sobre as classificações'],
 helpText:['Rank foods by measured nutrient density or a published serving.','Classez les aliments par densité nutritionnelle mesurée ou par portion publiée.','Sortiere Lebensmittel nach gemessener Nährstoffdichte oder veröffentlichter Portion.','Ordene alimentos pela densidade nutricional medida ou porção publicada.'],
 unknown:['Unknown','Inconnu','Unbekannt','Desconhecido'],uncategorized:['Uncategorized','Sans catégorie','Ohne Kategorie','Sem categoria'],include:['Include selected','Inclure la sélection','Einschließen','Incluir selecionadas'],exclude:['Exclude selected','Exclure la sélection','Ausschließen','Excluir selecionadas'],more:['Load more','Voir plus','Mehr laden','Carregar mais'],retry:['Retry','Réessayer','Erneut versuchen','Tentar novamente'],filter:['Filter foods','Filtrer les aliments','Lebensmittel filtern','Filtrar alimentos']
};
export const mobileOracleMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,i)=>[language,Object.fromEntries(Object.entries(rows).map(([key,values])=>['mobileOracle.'+key,values[i]]))]));
