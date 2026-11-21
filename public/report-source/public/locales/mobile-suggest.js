const rows={
 undo:['Undo','Annuler','Rückgängig','Desfazer'],
 itemDeleted:['Meal item deleted.','Aliment supprimé du repas.','Zutat aus Mahlzeit entfernt.','Item removido da refeição.'],
 addToMeal:['Add to Meal','Ajouter au repas','Zur Mahlzeit hinzuf\u00fcgen','Adicionar \u00e0 refei\u00e7\u00e3o'],

 editQuantity:['Edit quantity','Modifier la quantité','Menge bearbeiten','Editar quantidade'],applyQuantity:['Apply','Appliquer','Übernehmen','Aplicar'],changed:['This meal changed. Reopen the ingredient.','Ce repas a changé. Rouvrez l’aliment.','Diese Mahlzeit wurde geändert. Öffne den Bestandteil erneut.','Esta refeição mudou. Abra o ingrediente novamente.'],previewMismatch:['The preview does not match this ingredient. Try again.','L’aperçu ne correspond pas à cet aliment. Réessayez.','Die Vorschau entspricht nicht diesem Bestandteil. Versuche es erneut.','A prévia não corresponde a este ingrediente. Tente novamente.'],

 scores:['Nutrition Scores','Scores nutritionnels','Nährwert-Scores','Pontuações nutricionais'],

 'score.overall':['All Targets','Tous les objectifs','Alle Ziele','Todas as metas'],'score.vitamins':['Vitamins','Vitamines','Vitamine','Vitaminas'],'score.minerals':['Minerals','Minéraux','Mineralstoffe','Minerais'],'score.electrolytes':['Electrolytes','Électrolytes','Elektrolyte','Eletrólitos'],'score.immune':['Immune Support','Immunité','Immunsystem','Imunidade'],'score.antioxidants':['Antioxidants','Antioxydants','Antioxidantien','Antioxidantes'],'score.bone':['Bone Health','Santé osseuse','Knochengesundheit','Saúde óssea'],'score.metabolism':['Metabolism Support','Métabolisme','Stoffwechsel','Metabolismo'],



 addItem:['Add Meal Item','Ajouter un aliment','Mahlzeitbestandteil hinzufügen','Adicionar item'],removeItem:['Remove ingredient','Retirer cet aliment','Bestandteil entfernen','Remover ingrediente'],previewing:['Updating nutrition…','Mise à jour des nutriments…','Nährwerte werden aktualisiert…','Atualizando nutrientes…'],emptyMeal:['Add an ingredient to continue.','Ajoutez un aliment pour continuer.','Fügen Sie einen Bestandteil hinzu.','Adicione um ingrediente para continuar.'],noMetrics:['No metrics selected','Aucun indicateur sélectionné','Keine Werte ausgewählt','Nenhuma métrica selecionada'],nutritionPages:['Nutrition preview','Aperçu nutritionnel','Nährwertvorschau','Prévia nutricional'],previous:['Previous page','Page précédente','Vorherige Seite','Página anterior'],nextPage:['Next page','Page suivante','Nächste Seite','Próxima página'],



 diets:['Diets','Régimes','Ernährungsweisen','Dietas'],categories:['Category','Catégorie','Kategorie','Categoria'],exclusions:['Common Exclusions','Exclusions courantes','Häufige Ausschlüsse','Exclusões comuns'],includeCustom:['Include Custom Foods','Inclure les aliments personnalisés','Eigene Lebensmittel einbeziehen','Incluir alimentos personalizados'],

 retry:['Try again','Réessayer','Erneut versuchen','Tentar novamente'],

 title:['Suggest Food','Suggérer des aliments','Lebensmittel vorschlagen','Sugerir alimentos'],results:['Suggestions','Suggestions','Vorschläge','Sugestões'],select:['Select Filters & Get Suggestions','Choisissez vos filtres','Filter wählen und Vorschläge erhalten','Selecione filtros e obtenha sugestões'],options:['Options','Options','Optionen','Opções'],close:['Close','Fermer','Schließen','Fechar'],back:['Back to filters','Retour aux filtres','Zurück zu den Filtern','Voltar aos filtros'],all:['All','Tous','Alle','Todos'],none:['None','Aucune','Keine','Nenhuma'],items:['Meal Items','Aliments du repas','Mahlzeitbestandteile','Itens da refeição'],review:['Review & Add','Vérifier et ajouter','Prüfen und hinzufügen','Revisar e adicionar'],mealOptions:['Meal options','Options du repas','Mahlzeitoptionen','Opções da refeição'],generate:['Generate new results','Générer de nouveaux résultats','Neue Ergebnisse anzeigen','Gerar novos resultados']

};

export const mobileSuggestMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.fromEntries(Object.entries(rows).map(([key,values])=>['mobileSuggest.'+key,values[index]]))]));
