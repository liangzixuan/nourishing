const rows=[
 [
  "title",
  "Nutrient balances",
  "Équilibres nutritionnels",
  "Nährstoffverhältnisse",
  "Equilíbrios de nutrientes"
 ],
 [
  "hidden",
  "All balances are hidden in this capture. Change balance visibility in Nutrition insights to include them in a new report.",
  "Tous les équilibres sont masqués dans ce rapport. Modifiez leur visibilité dans les analyses nutritionnelles pour les inclure dans un nouveau rapport.",
  "Alle Verhältnisse sind in dieser Fassung verborgen. Ändere ihre Sichtbarkeit in den Ernährungsanalysen, um sie in einen neuen Bericht aufzunehmen.",
  "Todos os equilíbrios estão ocultos neste registro. Altere a visibilidade nas análises nutricionais para incluí-los em um novo relatório."
 ],
 [
  "method",
  "Each balance uses only dates with complete measurements for all its required inputs. Input amounts are means for exactly those same used dates.",
  "Chaque équilibre utilise uniquement les dates avec des mesures complètes de toutes ses données requises. Les quantités sont les moyennes de ces mêmes dates.",
  "Jedes Verhältnis verwendet nur Tage mit vollständigen Messungen aller erforderlichen Eingaben. Die Mengen sind Mittelwerte genau derselben verwendeten Tage.",
  "Cada equilíbrio usa apenas datas com medidas completas de todos os dados necessários. As quantidades são médias dessas mesmas datas usadas."
 ],
 [
  "ratios",
  "Ratios use pooled input amounts (equivalent to the ratio of their means), not the mean of daily ratios.",
  "Les rapports utilisent les quantités regroupées (soit le rapport de leurs moyennes), pas la moyenne des rapports quotidiens.",
  "Verhältnisse verwenden zusammengefasste Mengen (entsprechend dem Verhältnis ihrer Mittelwerte), nicht den Mittelwert täglicher Verhältnisse.",
  "As razões usam quantidades agrupadas (equivalentes à razão de suas médias), não a média das razões diárias."
 ],
 [
  "pralMean",
  "PRAL is the mean complete daily estimate.",
  "Le PRAL est la moyenne des estimations quotidiennes complètes.",
  "PRAL ist der Mittelwert vollständiger Tagesschätzungen.",
  "O PRAL é a média das estimativas diárias completas."
 ],
 [
  "zeros",
  "Ratio and PRAL captures include completion-zero dates; their zeros are not measured food contributions.",
  "Les rapports et le PRAL incluent les dates à zéro confirmé par clôture ; ces zéros ne sont pas des contributions alimentaires mesurées.",
  "Verhältnisse und PRAL enthalten durch Abschluss bestätigte Nulltage; deren Nullen sind keine gemessenen Lebensmittelbeiträge.",
  "Razões e PRAL incluem datas com zero confirmado pela conclusão; seus zeros não são contribuições alimentares medidas."
 ],
 [
  "calciumMean",
  "Calcium absorption uses the mean of accepted daily estimates, not an estimate from pooled inputs.",
  "L’absorption du calcium utilise la moyenne des estimations quotidiennes acceptées, pas une estimation des données regroupées.",
  "Die Calciumabsorption verwendet den Mittelwert akzeptierter Tagesschätzungen, keine Schätzung aus zusammengefassten Eingaben.",
  "A absorção de cálcio usa a média das estimativas diárias aceitas, não uma estimativa de dados agrupados."
 ],
 [
  "input",
  "Input",
  "Donnée",
  "Eingabe",
  "Dado"
 ],
 [
  "inputMean",
  "Mean for the same used dates",
  "Moyenne des mêmes dates utilisées",
  "Mittelwert derselben verwendeten Tage",
  "Média das mesmas datas usadas"
 ],
 [
  "unit",
  "Unit",
  "Unité",
  "Einheit",
  "Unidade"
 ],
 [
  "coverageHeading",
  "Measured contribution coverage",
  "Couverture des contributions mesurées",
  "Abdeckung gemessener Beiträge",
  "Cobertura das contribuições medidas"
 ],
 [
  "coefficientHeading",
  "Coefficient / mean contribution",
  "Coefficient / contribution moyenne",
  "Koeffizient / mittlerer Beitrag",
  "Coeficiente / contribuição média"
 ],
 [
  "coverage",
  "{{known}} / {{total}} contributions measured; {{status}} coverage.",
  "{{known}} / {{total}} contributions mesurées ; {{status}}.",
  "{{known}} / {{total}} Beiträge gemessen; {{status}}.",
  "{{known}} / {{total}} contribuições medidas; {{status}}."
 ],
 [
  "complete",
  "complete",
  "couverture complète",
  "vollständige Abdeckung",
  "cobertura completa"
 ],
 [
  "incomplete",
  "incomplete",
  "couverture incomplète",
  "unvollständige Abdeckung",
  "cobertura incompleta"
 ],
 [
  "contribution",
  "Coefficient: {{coefficient}}. Mean contribution: {{value}} mEq/day.",
  "Coefficient : {{coefficient}}. Contribution moyenne : {{value}} mEq/jour.",
  "Koeffizient: {{coefficient}}. Mittlerer Beitrag: {{value}} mEq/Tag.",
  "Coeficiente: {{coefficient}}. Contribuição média: {{value}} mEq/dia."
 ],
 [
  "days",
  "Dates used / eligible: {{used}} / {{eligible}}. Excluded: {{unknown}} unknown input; {{partial}} partial input; {{nonFinite}} nonfinite. Included completion-zero dates: {{completionZero}}.",
  "Dates utilisées / admissibles : {{used}} / {{eligible}}. Exclues : {{unknown}} données inconnues ; {{partial}} partielles ; {{nonFinite}} non finies. Dates incluses à zéro confirmé par clôture : {{completionZero}}.",
  "Verwendete / berücksichtigte Tage: {{used}} / {{eligible}}. Ausgeschlossen: {{unknown}} unbekannte Eingaben; {{partial}} unvollständige Eingaben; {{nonFinite}} nicht endliche Werte. Enthaltene durch Abschluss bestätigte Nulltage: {{completionZero}}.",
  "Datas usadas / elegíveis: {{used}} / {{eligible}}. Excluídas: {{unknown}} dados desconhecidos; {{partial}} parciais; {{nonFinite}} não finitos. Datas incluídas com zero confirmado pela conclusão: {{completionZero}}."
 ],
 [
  "calciumDays",
  "Dates used / eligible: {{used}} / {{eligible}}. Excluded: {{unknown}} unknown input; {{partial}} partial input; {{nonPositiveCalcium}} nonpositive calcium; {{outOfRange}} fraction outside 0–1; {{nonFinite}} nonfinite.",
  "Dates utilisées / admissibles : {{used}} / {{eligible}}. Exclues : {{unknown}} données inconnues ; {{partial}} partielles ; {{nonPositiveCalcium}} calcium non positif ; {{outOfRange}} fractions hors de 0–1 ; {{nonFinite}} non finies.",
  "Verwendete / berücksichtigte Tage: {{used}} / {{eligible}}. Ausgeschlossen: {{unknown}} unbekannte Eingaben; {{partial}} unvollständige Eingaben; {{nonPositiveCalcium}} nicht positives Calcium; {{outOfRange}} Anteile außerhalb 0–1; {{nonFinite}} nicht endliche Werte.",
  "Datas usadas / elegíveis: {{used}} / {{eligible}}. Excluídas: {{unknown}} dados desconhecidos; {{partial}} parciais; {{nonPositiveCalcium}} cálcio não positivo; {{outOfRange}} frações fora de 0–1; {{nonFinite}} não finitos."
 ],
 [
  "fractions",
  "Mean accepted fraction: {{fraction}}. Mean accepted raw model fraction: {{raw}}.",
  "Fraction acceptée moyenne : {{fraction}}. Fraction brute moyenne acceptée du modèle : {{raw}}.",
  "Mittlerer akzeptierter Anteil: {{fraction}}. Mittlerer akzeptierter Modellrohanteil: {{raw}}.",
  "Fração média aceita: {{fraction}}. Fração bruta média aceita do modelo: {{raw}}."
 ],
 [
  "calciumAccepted",
  "Mean of accepted daily calcium-absorption estimates.",
  "Moyenne des estimations quotidiennes acceptées d’absorption du calcium.",
  "Mittelwert akzeptierter täglicher Calciumabsorptionsschätzungen.",
  "Média das estimativas diárias aceitas de absorção de cálcio."
 ],
 [
  "calciumUnavailable",
  "Unavailable: no dates have complete inputs and an accepted model result.",
  "Indisponible : aucune date n’a des données complètes et un résultat de modèle accepté.",
  "Nicht verfügbar: Kein Tag hat vollständige Eingaben und ein akzeptiertes Modellergebnis.",
  "Indisponível: nenhuma data tem dados completos e um resultado aceito do modelo."
 ],
 [
  "dimensionless",
  "dimensionless",
  "sans dimension",
  "dimensionslos",
  "adimensional"
 ],
 [
  "ratio",
  "Ratio of the same-date pooled complete inputs.",
  "Rapport des données complètes regroupées des mêmes dates.",
  "Verhältnis zusammengefasster vollständiger Eingaben derselben Tage.",
  "Razão dos dados completos agrupados das mesmas datas."
 ],
 [
  "pral",
  "Mean food-based daily acid load estimate.",
  "Estimation moyenne de la charge acide alimentaire quotidienne.",
  "Mittlere tägliche Schätzung der Säurelast aus Lebensmitteln.",
  "Estimativa média diária da carga ácida alimentar."
 ],
 [
  "reason.no-complete-days",
  "Unavailable: no dates have complete measurements for all required inputs.",
  "Indisponible : aucune date n’a de mesures complètes pour toutes les données requises.",
  "Nicht verfügbar: Kein Tag hat vollständige Messungen aller erforderlichen Eingaben.",
  "Indisponível: nenhuma data tem medidas completas de todos os dados necessários."
 ],
 [
  "reason.unknown-input",
  "Unavailable: a required input is unknown.",
  "Indisponible : une donnée requise est inconnue.",
  "Nicht verfügbar: Eine erforderliche Eingabe ist unbekannt.",
  "Indisponível: um dado necessário é desconhecido."
 ],
 [
  "reason.partial-input",
  "Withheld: a required input has partial measurement coverage.",
  "Non affiché : une donnée requise a une couverture de mesure partielle.",
  "Zurückgehalten: Eine erforderliche Eingabe hat unvollständige Messabdeckung.",
  "Não exibido: um dado necessário tem cobertura parcial de medidas."
 ],
 [
  "reason.zero-denominator",
  "Unavailable: the pooled denominator is zero.",
  "Indisponible : le dénominateur regroupé est nul.",
  "Nicht verfügbar: Der zusammengefasste Nenner ist null.",
  "Indisponível: o denominador agrupado é zero."
 ],
 [
  "reason.non-finite-result",
  "Unavailable: the calculation has no finite result.",
  "Indisponible : le calcul n’a pas de résultat fini.",
  "Nicht verfügbar: Die Berechnung hat kein endliches Ergebnis.",
  "Indisponível: o cálculo não tem resultado finito."
 ],
 [
  "equalityIncluded",
  "Equality included. No upper bound.",
  "Égalité incluse. Aucune borne supérieure.",
  "Gleichheit eingeschlossen. Keine Obergrenze.",
  "Igualdade incluída. Sem limite superior."
 ],
 [
  "equalityExcluded",
  "Equality excluded. No upper bound.",
  "Égalité exclue. Aucune borne supérieure.",
  "Gleichheit ausgeschlossen. Keine Obergrenze.",
  "Igualdade excluída. Sem limite superior."
 ],
 [
  "publishedFormula",
  "Published formula",
  "Formule publiée",
  "Veröffentlichte Formel",
  "Fórmula publicada"
 ],
 [
  "formulaSource",
  "Formula source",
  "Source de la formule",
  "Formelquelle",
  "Fonte da fórmula"
 ],
 [
  "referenceSource",
  "Reference source",
  "Source de référence",
  "Referenzquelle",
  "Fonte de referência"
 ]
];
export const balancePrintMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(rows.map(([key,...values])=>['balancePrint.'+key,values[index]])))])));
