const rows={
 water:['Water','Eau','Wasser','Água'],
 carbs:['Total Carbs','Glucides totaux','Gesamtkohlenhydrate','Carboidratos totais'],
 netCarbohydrate:['Net Carbs','Glucides nets','Netto-Kohlenhydrate','Carboidratos líquidos'],
 fat:['Fat','Lipides','Fett','Gordura'],
 overall:['All Targets','Tous les objectifs','Alle Ziele','Todas as metas'],
 vitamins:['Vitamins','Vitamines','Vitamine','Vitaminas'],
 minerals:['Minerals','Minéraux','Mineralstoffe','Minerais'],
 electrolytes:['Electrolytes','Électrolytes','Elektrolyte','Eletrólitos'],
 immune:['Immune Support','Soutien immunitaire','Immunsystem','Suporte imunológico'],
 antioxidants:['Antioxidants','Antioxydants','Antioxidantien','Antioxidantes'],
 bone:['Bone Health','Santé osseuse','Knochengesundheit','Saúde óssea'],
 metabolism:['Metabolism Support','Métabolisme','Stoffwechsel','Metabolismo'],
 target:['Target','Objectif','Ziel','Meta'],
 consumed:['Consumed','Consommé','Verzehrt','Consumido'],
 expenditure:['Expenditure','Dépense','Verbrauch','Gasto'],
 remaining:['Remaining','Restant','Verbleibend','Restante'],
 macros:['Macro Targets','Objectifs de macros','Makroziele','Metas de macros'],
 details:['More details','Plus de détails','Weitere Details','Mais detalhes'],
 report:['Daily Report','Rapport quotidien','Tagesbericht','Relatório diário'],
 uncategorized:['Uncategorized','Non classé','Nicht kategorisiert','Sem categoria']
};
export const mobileDiaryMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((lang,i)=>[lang,Object.fromEntries(Object.entries(rows).map(([key,values])=>['mobileDiary.'+key,values[i]]))]));
