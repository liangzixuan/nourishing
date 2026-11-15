const rows=[
 [
  "title",
  "Mean daily food-data completeness",
  "Complétude quotidienne moyenne des données alimentaires",
  "Mittlere tägliche Vollständigkeit der Lebensmitteldaten",
  "Completude média diária dos dados alimentares"
 ],
 [
  "method",
  "Equal-weight mean of defined daily availability percentages. A day with 0% counts; an unknown day does not. This is not pooled food coverage, nutrient-target progress, or source confidence. Full days have 100% availability.",
  "Moyenne à poids égaux des pourcentages quotidiens définis de disponibilité. Un jour à 0 % compte ; un jour inconnu ne compte pas. Ce n’est ni une couverture alimentaire regroupée, ni une progression vers les objectifs, ni une confiance des sources. Les jours complets ont 100 % de disponibilité.",
  "Gleich gewichteter Mittelwert definierter täglicher Verfügbarkeiten. Ein Tag mit 0 % zählt; ein unbekannter Tag nicht. Dies ist weder zusammengefasste Lebensmittelabdeckung noch Zielfortschritt oder Quellenkonfidenz. Vollständige Tage haben 100 % Verfügbarkeit.",
  "Média com pesos iguais das porcentagens diárias definidas de disponibilidade. Um dia com 0% conta; um dia desconhecido não. Não é cobertura alimentar agrupada, progresso das metas nem confiança das fontes. Dias completos têm 100% de disponibilidade."
 ],
 [
  "overall",
  "Overall food-data completeness",
  "Complétude globale des données alimentaires",
  "Gesamte Vollständigkeit der Lebensmitteldaten",
  "Completude geral dos dados alimentares"
 ],
 [
  "dayCounts",
  "{{full}} full; {{incomplete}} incomplete; {{unknown}} unknown",
  "{{full}} complets ; {{incomplete}} incomplets ; {{unknown}} inconnus",
  "{{full}} vollständig; {{incomplete}} unvollständig; {{unknown}} unbekannt",
  "{{full}} completos; {{incomplete}} incompletos; {{unknown}} desconhecidos"
 ],
 [
  "varies",
  "Changes across dates",
  "Varie selon la date",
  "Ändert sich je nach Datum",
  "Muda entre as datas"
 ],
 [
  "same",
  "Same across dates",
  "Identique à chaque date",
  "An allen Daten gleich",
  "Igual em todas as datas"
 ],
 [
  "nutrientRegion",
  "Nutrient food-data completeness",
  "Complétude alimentaire par nutriment",
  "Vollständigkeit nach Nährstoff",
  "Completude alimentar por nutriente"
 ],
 [
  "groupRegion",
  "Group food-data completeness",
  "Complétude alimentaire par groupe",
  "Vollständigkeit nach Gruppe",
  "Completude alimentar por grupo"
 ],
 [
  "nutrient",
  "Nutrient",
  "Nutriment",
  "Nährstoff",
  "Nutriente"
 ],
 [
  "group",
  "Group",
  "Groupe",
  "Gruppe",
  "Grupo"
 ],
 [
  "mean",
  "Mean availability",
  "Disponibilité moyenne",
  "Mittlere Verfügbarkeit",
  "Disponibilidade média"
 ],
 [
  "defined",
  "Defined / eligible days",
  "Jours définis / admissibles",
  "Definierte / berücksichtigte Tage",
  "Dias definidos / elegíveis"
 ],
 [
  "counts",
  "Day counts",
  "Nombre de jours",
  "Tagesanzahlen",
  "Contagens de dias"
 ],
 [
  "membership",
  "Target membership",
  "Composition des objectifs",
  "Zielzusammensetzung",
  "Composição das metas"
 ],
 [
  "daily",
  "Captured daily food data ({{count}} eligible dates)",
  "Données alimentaires quotidiennes enregistrées ({{count}} dates admissibles)",
  "Erfasste tägliche Lebensmitteldaten ({{count}} berücksichtigte Daten)",
  "Dados alimentares diários registrados ({{count}} datas elegíveis)"
 ],
 [
  "dailyHelp",
  "Expand a date for its known food counts and exact target-group membership. These facts belong to this report capture.",
  "Développez une date pour voir ses comptes alimentaires connus et la composition exacte des groupes d’objectifs. Ces données appartiennent à ce rapport enregistré.",
  "Öffne ein Datum für die bekannten Lebensmittelanzahlen und die genaue Zielgruppenzusammensetzung. Diese Angaben gehören zur erfassten Fassung dieses Berichts.",
  "Expanda uma data para ver suas contagens alimentares conhecidas e a composição exata dos grupos de metas. Esses dados pertencem a este relatório registrado."
 ],
 [
  "byNutrient",
  "Availability by nutrient",
  "Disponibilité par nutriment",
  "Verfügbarkeit nach Nährstoff",
  "Disponibilidade por nutriente"
 ]
];
export const completenessReportMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(rows.map(([key,...values])=>['completenessReport.'+key,values[index]])))])));
