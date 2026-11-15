const rows={
  "title": [
    "Effect on your recorded day",
    "Effet sur votre journée enregistrée",
    "Auswirkung auf Ihren erfassten Tag",
    "Efeito no seu dia registrado"
  ],
  "unknown": [
    "Unknown",
    "Inconnu",
    "Unbekannt",
    "Desconhecido"
  ],
  "otherFoods": [
    "Other foods",
    "Autres aliments",
    "Andere Lebensmittel",
    "Outros alimentos"
  ],
  "recorded": [
    "Recorded",
    "Enregistré",
    "Erfasst",
    "Registrado"
  ],
  "reviewedMeal": [
    "Reviewed meal",
    "Repas vérifié",
    "Geprüfte Mahlzeit",
    "Refeição revisada"
  ],
  "adds": [
    "Meal adds",
    "Ajout du repas",
    "Beitrag der Mahlzeit",
    "Adição da refeição"
  ],
  "afterUpdate": [
    "After update",
    "Après modification",
    "Nach Aktualisierung",
    "Após atualização"
  ],
  "afterMeal": [
    "After meal",
    "Après le repas",
    "Nach der Mahlzeit",
    "Após a refeição"
  ],
  "target": [
    "Target after meal: {{value}}",
    "Objectif après le repas : {{value}}",
    "Ziel nach der Mahlzeit: {{value}}",
    "Meta após a refeição: {{value}}"
  ],
  "foodsMeasured": [
    "{{known}}/{{total}} foods measured",
    "{{known}}/{{total}} aliments mesurés",
    "{{known}}/{{total}} Lebensmittel gemessen",
    "{{known}}/{{total}} alimentos medidos"
  ],
  "partial": [
    "partial",
    "partiel",
    "teilweise",
    "parcial"
  ],
  "replaceScope": [
    "Solid bars show other recorded foods; stripes show the reviewed meal. Saving replaces the linked meal entries.",
    "Les barres pleines représentent les autres aliments enregistrés ; les rayures représentent le repas vérifié. L’enregistrement remplace les entrées liées au repas.",
    "Durchgehende Balken zeigen andere erfasste Lebensmittel; Streifen zeigen die geprüfte Mahlzeit. Beim Speichern werden die verknüpften Mahlzeiteinträge ersetzt.",
    "As barras sólidas mostram os outros alimentos registrados; as listras mostram a refeição revisada. Salvar substitui os registros vinculados à refeição."
  ],
  "newScope": [
    "Solid bars show recorded intake; stripes show this meal.",
    "Les barres pleines représentent les apports enregistrés ; les rayures représentent ce repas.",
    "Durchgehende Balken zeigen die erfasste Aufnahme; Streifen zeigen diese Mahlzeit.",
    "As barras sólidas mostram o consumo registrado; as listras mostram esta refeição."
  ],
  "partialHelp": [
    "Partial values omit missing measurements. Targets can change when configured energy calculations include food intake.",
    "Les valeurs partielles excluent les mesures manquantes. Les objectifs peuvent changer si les calculs d’énergie configurés incluent les apports alimentaires.",
    "Teilwerte lassen fehlende Messungen aus. Ziele können sich ändern, wenn die eingestellte Energieberechnung die Nahrungsaufnahme einbezieht.",
    "Valores parciais não incluem medições ausentes. As metas podem mudar quando os cálculos de energia configurados incluem o consumo alimentar."
  ],
  "completed": [
    "This day is marked complete. Reopen the day before adding diary entries.",
    "Cette journée est marquée comme terminée. Rouvrez-la avant d’ajouter des entrées.",
    "Dieser Tag ist als abgeschlossen markiert. Öffnen Sie ihn erneut, bevor Sie Einträge hinzufügen.",
    "Este dia está marcado como concluído. Reabra o dia antes de adicionar registros."
  ],
  "macros": [
    "Energy and macros",
    "Énergie et macronutriments",
    "Energie und Makronährstoffe",
    "Energia e macronutrientes"
  ],
  "highlights": [
    "Highlighted nutrients",
    "Nutriments mis en avant",
    "Hervorgehobene Nährstoffe",
    "Nutrientes em destaque"
  ],
  "scores": [
    "Selected nutrition scores",
    "Scores nutritionnels sélectionnés",
    "Ausgewählte Ernährungswerte",
    "Pontuações nutricionais selecionadas"
  ],
  "components": [
    "{{known}}/{{total}} components measured",
    "{{known}}/{{total}} composantes mesurées",
    "{{known}}/{{total}} Bestandteile gemessen",
    "{{known}}/{{total}} componentes medidos"
  ],
  "scoresHelp": [
    "Score methods and nutrient coverage are available in Nutrition Scores.",
    "Les méthodes de calcul et la couverture nutritionnelle sont disponibles dans Scores nutritionnels.",
    "Berechnungsmethoden und Nährstoffabdeckung finden Sie unter Nährwert-Scores.",
    "Os métodos de cálculo e a cobertura de nutrientes estão disponíveis em Pontuações nutricionais."
  ]
};
export const mealImpactMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(Object.entries(rows).map(([key,values])=>['mealImpact.'+key,values[index]])))])));
