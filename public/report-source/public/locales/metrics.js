const rows=[
 ['metric.energy.expenditure','Estimated energy expenditure','Dépense énergétique estimée','Geschätzter Energieverbrauch','Gasto energético estimado'],
 ['metric.energy.target','Effective energy target','Objectif énergétique effectif','Wirksames Energieziel','Meta energética efetiva'],
 ['metric.energy.remaining','Energy remaining to target','Énergie restante pour atteindre l’objectif','Verbleibende Energie bis zum Ziel','Energia restante até a meta'],
 ['metric.energy.balance','Energy balance','Bilan énergétique','Energiebilanz','Balanço energético'],

 ['metric.tracked','{{name}} (tracked)','{{name}} (suivi actif)','{{name}} (erfasst)','{{name}} (monitorado)'],
 ['metric.trackedCarbohydrate','Tracked carbohydrate','Glucides suivis','Erfasste Kohlenhydrate','Carboidratos monitorados'],
 ['metric.completeness','Food-data completeness','Disponibilité des données alimentaires','Vollständigkeit der Lebensmitteldaten','Completude dos dados alimentares'],
 ['metric.nutrientCompleteness','{{name}} food-data completeness','Disponibilité des données alimentaires : {{name}}','Vollständigkeit der Lebensmitteldaten: {{name}}','Completude dos dados alimentares: {{name}}'],
 ['metric.capturedFoodData','{{name}}: captured daily food data','{{name}} : données alimentaires quotidiennes enregistrées','{{name}}: erfasste tägliche Lebensmitteldaten','{{name}}: dados alimentares diários capturados'],
];
export const metricMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(rows.map(([key,...values])=>[key,values[index]])))])));
