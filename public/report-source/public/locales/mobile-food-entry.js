const rows={
 close:['Close','Fermer','Schließen','Fechar'],back:['Back to foods','Retour aux aliments','Zurück zur Suche','Voltar aos alimentos'],options:['Food options','Options de l’aliment','Lebensmitteloptionen','Opções do alimento'],
 source:['Source details','Détails de la source','Quelldetails','Detalhes da fonte'],date:['Date','Date','Datum','Data'],copy:['Edit a copy','Modifier une copie','Kopie bearbeiten','Editar uma cópia'],
 amount:['Amount','Quantité','Menge','Quantidade'],serving:['Serving Size','Portion','Portionsgröße','Tamanho da porção'],servings:['Servings','Portions','Portionen','Porções'],
 timestamp:['Timestamp','Heure','Uhrzeit','Horário'],useTimestamp:['Include timestamp','Inclure l’heure','Uhrzeit verwenden','Incluir horário'],group:['Group','Groupe','Gruppe','Grupo'],
 dataSource:['Data Source','Source des données','Datenquelle','Fonte dos dados'],loading:['Loading nutrition…','Chargement…','Nährwerte werden geladen…','Carregando nutrientes…'],
 save:['Save','Enregistrer','Speichern','Salvar'],add:['Add to Diary','Ajouter au journal','Zum Tagebuch hinzufügen','Adicionar ao diário'],
 enterAmount:['Enter a valid amount and date.','Saisissez une quantité et une date valides.','Gültige Menge und Datum eingeben.','Insira quantidade e data válidas.'],unavailable:['Nutrition preview unavailable.','Aperçu nutritionnel indisponible.','Nährwertvorschau nicht verfügbar.','Prévia nutricional indisponível.'],retry:['Retry','Réessayer','Erneut versuchen','Tentar novamente'],
 energy:['Energy Summary','Résumé énergétique','Energieübersicht','Resumo de energia'],macros:['Macronutrient Targets','Objectifs de macronutriments','Makronährstoffziele','Metas de macronutrientes'],
 count:['{{count}} Listed Nutrients','{{count}} nutriments indiqués','{{count}} erfasste Nährstoffe','{{count}} nutrientes listados'],per:['Nutrition per {{amount}} {{serving}}','Nutrition pour {{amount}} {{serving}}','Nährwerte pro {{amount}} {{serving}}','Nutrientes por {{amount}} {{serving}}'],
 missing:['— Not measured · * Partial data','— Non mesuré · * Données partielles','— Nicht gemessen · * Teilweise Daten','— Não medido · * Dados parciais']
};
export const mobileFoodMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,i)=>[language,Object.fromEntries(Object.entries(rows).map(([key,values])=>['mobileFood.'+key,values[i]]))]));
