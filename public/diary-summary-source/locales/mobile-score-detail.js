const rows={
 function:['Function','Fonction','Funktion','Função'],
 quality:['Data Quality','Qualité des données','Datenqualität','Qualidade dos dados'],
 report:['View Daily Report','Voir le rapport quotidien','Tagesbericht anzeigen','Ver relatório diário'],
 help:['Score details','Détails du score','Details zum Wert','Detalhes da pontuação'],
 close:['Close','Fermer','Schließen','Fechar'],
 unavailable:['Unavailable','Indisponible','Nicht verfügbar','Indisponível'],
 confidence:['Confidence in the logged food data: {{value}}.','Fiabilité des données alimentaires enregistrées : {{value}}.','Vertrauen in die erfassten Lebensmitteldaten: {{value}}.','Confiança nos dados alimentares registrados: {{value}}.'],
 noConfidence:['Confidence is unavailable for this score.','La fiabilité est indisponible pour ce score.','Für diesen Wert ist keine Vertrauensangabe verfügbar.','A confiança não está disponível para esta pontuação.'],
 qualityValue:['Quality of the logged food data: {{value}}.','Qualité des données alimentaires enregistrées : {{value}}.','Qualität der erfassten Lebensmitteldaten: {{value}}.','Qualidade dos dados alimentares registrados: {{value}}.'],
 overall:['Progress toward all visible nutrition targets.','Progression vers tous les objectifs nutritionnels visibles.','Fortschritt bei allen sichtbaren Nährstoffzielen.','Progresso em todas as metas nutricionais visíveis.'],
 progress:['Progress toward the nutrient targets included in {{name}}.','Progression vers les objectifs nutritionnels inclus dans {{name}}.','Fortschritt bei den Nährstoffzielen für {{name}}.','Progresso nas metas nutricionais incluídas em {{name}}.'],
 keto:['Nutrient target progress, adjusted for the carbohydrate limit.','Progression vers les objectifs nutritionnels, ajustée selon la limite de glucides.','Fortschritt bei Nährstoffzielen, angepasst an die Kohlenhydratgrenze.','Progresso nas metas nutricionais, ajustado pelo limite de carboidratos.'],
 oral:['Progress toward nutrient targets and the sugar limit.','Progression vers les objectifs nutritionnels et la limite de sucre.','Fortschritt bei Nährstoffzielen und der Zuckergrenze.','Progresso nas metas nutricionais e no limite de açúcar.'],
 calciumAbsorption:['Estimated calcium absorption from logged calcium, oxalate and phytate.','Absorption de calcium estimée à partir du calcium, des oxalates et des phytates enregistrés.','Geschätzte Kalziumaufnahme anhand des erfassten Kalziums, Oxalats und Phytats.','Absorção estimada de cálcio a partir do cálcio, oxalato e fitato registrados.'],
 dataQuality:['Completeness and source quality of logged food data.','Complétude et qualité des sources des données alimentaires enregistrées.','Vollständigkeit und Quellenqualität der erfassten Lebensmitteldaten.','Completude e qualidade das fontes dos dados alimentares registrados.']
};
export const mobileScoreDetailMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,i)=>[language,Object.fromEntries(Object.entries(rows).map(([key,values])=>['mobileScoreDetail.'+key,values[i]]))]));
