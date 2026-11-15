const rows=[
 ['title','Energy summary','Résumé énergétique','Energieübersicht','Resumo de energia'],
 ['day','Full diary day · {{date}}','Journée complète du journal · {{date}}','Vollständiger Tagebuchtag · {{date}}','Dia completo do diário · {{date}}'],
 ['consumedUnit','Consumed {{unit}}','Apport en {{unit}}','Aufnahme in {{unit}}','Consumo em {{unit}}'],
 ['target','Intake target','Objectif d’apport','Aufnahmeziel','Meta de consumo'],
 ['expenditure','Expenditure estimate','Dépense estimée','Geschätzter Verbrauch','Gasto estimado'],
 ['configuredTarget','Configured fixed target','Objectif fixe configuré','Eingestelltes festes Ziel','Meta fixa configurada'],
 ['targetBaseline','Target before activity addition','Objectif avant ajout de l’activité','Ziel vor dem Aktivitätszuschlag','Meta antes de adicionar atividade'],
 ['resting','Resting energy','Énergie de repos','Ruheenergie','Energia de repouso'],
 ['baseline','Baseline activity','Activité de base','Basisaktivität','Atividade de base'],
 ['adjustedBaseline','Adjusted baseline activity','Activité de base ajustée','Angepasste Basisaktivität','Atividade de base ajustada'],
 ['activity','Activity used','Activité utilisée','Berücksichtigte Aktivität','Atividade considerada'],
 ['thermicEffect','Food digestion estimate (TEF)','Estimation de la digestion (TEF)','Geschätzte Nahrungsverdauung (TEF)','Estimativa da digestão (TEF)'],
 ['aboveBaseline','Energy above baseline','Énergie au-delà de la base','Energie über der Basis','Energia acima da base'],
 ['estimate','Expenditure is an estimate under your saved inputs.','La dépense est estimée selon vos données enregistrées.','Der Verbrauch wird anhand Ihrer gespeicherten Eingaben geschätzt.','O gasto é estimado com base nos dados salvos.'],
 ['fixed','A fixed intake target is active. Set up resting energy and activity to estimate expenditure.','Un objectif d’apport fixe est actif. Configurez l’énergie de repos et l’activité pour estimer la dépense.','Ein festes Aufnahmeziel ist aktiv. Richten Sie Ruheenergie und Aktivität ein, um den Verbrauch zu schätzen.','Uma meta fixa de consumo está ativa. Configure a energia de repouso e a atividade para estimar o gasto.'],
 ['arithmetic','Remaining is target minus consumed. Balance is expenditure minus consumed.','Le reste correspond à l’objectif moins l’apport. Le bilan correspond à la dépense moins l’apport.','Verbleibend bedeutet Ziel minus Aufnahme. Bilanz bedeutet Verbrauch minus Aufnahme.','Restante significa meta menos consumo. Balanço significa gasto menos consumo.'],
 ['device','Device active calories: {{value}}. Source time zone: {{zone}}. Read through {{end}}. This window does not prove continuous device coverage.','Calories actives de l’appareil : {{value}}. Fuseau horaire source : {{zone}}. Lecture jusqu’au {{end}}. Cette période ne prouve pas une couverture continue de l’appareil.','Aktive Gerätekalorien: {{value}}. Zeitzone der Quelle: {{zone}}. Gelesen bis {{end}}. Dieses Zeitfenster belegt keine durchgehende Geräteerfassung.','Calorias ativas do dispositivo: {{value}}. Fuso horário da origem: {{zone}}. Leitura até {{end}}. Esse intervalo não comprova cobertura contínua do dispositivo.'],
 ['deviceExercise','Device totals may include workouts. Recorded exercise is shown separately and is not added to device activity.','Les totaux de l’appareil peuvent inclure des entraînements. L’exercice enregistré est affiché séparément et n’est pas ajouté à l’activité de l’appareil.','Gerätesummen können Training enthalten. Erfasstes Training wird separat angezeigt und nicht zur Geräteaktivität addiert.','Os totais do dispositivo podem incluir treinos. O exercício registrado aparece separadamente e não é somado à atividade do dispositivo.'],
 ['components','Calculation components','Composantes du calcul','Berechnungsbestandteile','Componentes do cálculo'],
 ['unavailable','Energy calculations are unavailable.','Les calculs énergétiques sont indisponibles.','Energieberechnungen sind nicht verfügbar.','Os cálculos de energia estão indisponíveis.']
];
export const energySummaryMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.fromEntries(rows.map(([key,...values])=>['energySummary.'+key,values[index]]))]));
