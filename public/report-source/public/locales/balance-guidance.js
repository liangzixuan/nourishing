import {balanceGuidance} from './../../server/balance-guidance.mjs';
const rows=[
 [
  "day.ratios",
  "Les rapports quotidiens divisent les totaux nutritionnels enregistrés non arrondis dans des unités sources correspondantes. L’affichage peut arrondir ces valeurs brutes.",
  "Tägliche Verhältnisse teilen ungerundete erfasste Nährstoffsummen mit passenden Quelleinheiten. Die Anzeige kann diese Rohwerte runden.",
  "As razões diárias dividem os totais nutricionais registrados sem arredondamento e com unidades de origem correspondentes. A exibição pode arredondar esses valores brutos."
 ],
 [
  "day.unavailable",
  "Un rapport est retenu si une donnée est inconnue ou partielle, si le dénominateur est nul ou si la division n’a pas de résultat fini.",
  "Ein Verhältnis wird zurückgehalten, wenn eine Eingabe unbekannt oder unvollständig ist, der Nenner null ist oder die Division kein endliches Ergebnis hat.",
  "Uma razão não é exibida quando um dado é desconhecido ou parcial, o denominador é zero ou a divisão não tem resultado finito."
 ],
 [
  "day.zeros",
  "Les zéros confirmés par la clôture du journal sans contributions mesurées sont indiqués séparément. Les mesures alimentaires manquantes restent inconnues après la clôture.",
  "Durch Tagebuchabschluss bestätigte Nullen ohne gemessene Beiträge werden gesondert gekennzeichnet. Fehlende Lebensmittelmesswerte bleiben nach dem Abschluss unbekannt.",
  "Zeros confirmados pela conclusão do diário sem contribuições medidas são identificados separadamente. Medições alimentares ausentes continuam desconhecidas após a conclusão."
 ],
 [
  "day.references",
  "Les bandes des rapports sont des plages de référence publiées, pas des objectifs personnalisés ni des conseils cliniques.",
  "Die Verhältnisbereiche sind veröffentlichte Referenzbereiche, keine persönlichen Ziele oder klinischen Empfehlungen.",
  "As faixas das razões são referências publicadas, não metas personalizadas nem orientações clínicas."
 ],
 [
  "day.pral",
  "Le PRAL estime la charge acide alimentaire à partir des nutriments enregistrés. Il ne mesure ni le pH sanguin ni la fonction rénale.",
  "PRAL schätzt die Säurelast der Ernährung aus erfassten Nährstoffen. Es misst weder den Blut-pH-Wert noch die Nierenfunktion.",
  "O PRAL estima a carga ácida alimentar a partir dos nutrientes registrados. Não mede o pH do sangue nem a função renal."
 ],
 [
  "day.pral-inputs",
  "Le PRAL est retenu si une donnée requise est inconnue ou partielle. Les valeurs signées et l’annulation décimale exacte sont conservées.",
  "PRAL wird bei unbekannten oder unvollständigen erforderlichen Eingaben zurückgehalten. Vorzeichen und die exakte Aufhebung von Dezimalwerten bleiben erhalten.",
  "O PRAL não é exibido quando algum dado necessário é desconhecido ou parcial. Valores com sinal e cancelamento decimal exato são mantidos."
 ],
 [
  "period.dates",
  "Chaque équilibre utilise uniquement les dates avec des mesures complètes pour toutes ses données requises. Les dates inconnues, partielles et non finies sont exclues ensemble, dans cet ordre.",
  "Jedes Verhältnis verwendet nur Tage mit vollständigen Messungen aller erforderlichen Eingaben. Unbekannte, unvollständige und nicht endliche Tage werden gemeinsam in dieser Reihenfolge ausgeschlossen.",
  "Cada equilíbrio usa apenas datas com medidas completas de todos os dados necessários. Datas desconhecidas, parciais e não finitas são excluídas em conjunto, nessa ordem."
 ],
 [
  "period.ratios",
  "Les rapports divisent les sommes regroupées non arrondies, soit le rapport des moyennes des mêmes dates utilisées. Ce ne sont pas des moyennes de rapports quotidiens. Les dates complètes avec un dénominateur nul restent dans le groupe.",
  "Verhältnisse teilen zusammengefasste ungerundete Summen und entsprechen dem Verhältnis der Mittelwerte derselben verwendeten Tage. Sie sind keine Mittelwerte täglicher Verhältnisse. Vollständige Tage mit Nenner null bleiben enthalten.",
  "As razões dividem as somas agrupadas sem arredondamento, equivalentes à razão das médias das mesmas datas usadas. Não são médias das razões diárias. Datas completas com denominador zero permanecem no conjunto."
 ],
 [
  "period.inputs",
  "Les quantités sont des moyennes quotidiennes des mêmes dates utilisées pour cet équilibre. Les comptes de couverture additionnent les contributions alimentaires de ces dates. Les dates à zéro confirmé par clôture sont comptées séparément.",
  "Eingabemengen sind Tagesmittelwerte derselben für das Verhältnis verwendeten Tage. Abdeckungsanzahlen summieren die Lebensmittelbeiträge dieser Tage. Durch Abschluss bestätigte Nulltage werden separat gezählt.",
  "As quantidades são médias diárias das mesmas datas usadas para esse equilíbrio. As contagens de cobertura somam as contribuições alimentares dessas datas. Datas com zero confirmado pela conclusão são contadas separadamente."
 ],
 [
  "period.pral",
  "Le PRAL est la moyenne des estimations quotidiennes complètes, avec conservation des signes et de l’annulation décimale. Différents équilibres peuvent utiliser des ensembles de dates différents.",
  "PRAL ist der Mittelwert vollständiger Tagesschätzungen mit erhaltenen Vorzeichen und Dezimalaufhebung. Verschiedene Verhältnisse können unterschiedliche Tage verwenden.",
  "O PRAL é a média das estimativas diárias completas, mantendo sinais e cancelamento decimal. Equilíbrios diferentes podem usar conjuntos de datas diferentes."
 ],
 [
  "period.references",
  "Les bandes des rapports sont des plages de référence publiées, pas des objectifs personnalisés ni des conseils cliniques. Le PRAL ne mesure ni le pH sanguin ni la fonction rénale.",
  "Die Verhältnisbereiche sind veröffentlichte Referenzbereiche, keine persönlichen Ziele oder klinischen Empfehlungen. PRAL misst weder den Blut-pH-Wert noch die Nierenfunktion.",
  "As faixas das razões são referências publicadas, não metas personalizadas nem orientações clínicas. O PRAL não mede o pH do sangue nem a função renal."
 ],
 [
  "calcium.estimate",
  "Cette estimation par équation publiée ne mesure pas l’absorption individuelle du calcium et ne modifie pas les objectifs alimentaires de calcium.",
  "Diese Schätzung mit einer veröffentlichten Gleichung misst keine individuelle Calciumaufnahme und ändert die Calciumziele der Ernährung nicht.",
  "Esta estimativa por equação publicada não mede a absorção individual de cálcio nem altera as metas alimentares de cálcio."
 ],
 [
  "calcium.study",
  "L’étude citée utilisait des quantités d’aliments ou de repas tests. Elle ne prouve pas que l’équation est valide pour tous les totaux quotidiens ou toutes les alimentations individuelles.",
  "Die zitierte Studie verwendete Lebensmittelmengen oder Testmahlzeiten. Sie belegt nicht die Gültigkeit der Gleichung für alle Tagessummen oder individuellen Ernährungsweisen.",
  "O estudo citado usou quantidades de alimentos ou refeições de teste. Não estabelece que a equação seja válida para todos os totais diários ou dietas individuais."
 ],
 [
  "calcium.missing",
  "Des mesures requises manquantes ou partielles empêchent l’estimation. L’oxalate ou le phytate inconnu n’est pas supposé nul.",
  "Fehlende oder unvollständige erforderliche Messwerte verhindern die Schätzung. Unbekanntes Oxalat oder Phytat wird nicht als null angenommen.",
  "Medições necessárias ausentes ou parciais impedem a estimativa. Oxalato ou fitato desconhecido não é presumido como zero."
 ],
 [
  "calcium.range",
  "Les fractions hors de zéro à un sont conservées comme résultats bruts, sans être bornées ni présentées comme calcium absorbé.",
  "Anteile außerhalb von null bis eins bleiben als Rohergebnisse erhalten; sie werden weder begrenzt noch als aufgenommenes Calcium angezeigt.",
  "Frações fora de zero a um são mantidas como resultados brutos, sem serem limitadas nem apresentadas como cálcio absorvido."
 ],
 [
  "calcium.period",
  "Les valeurs de période sont les moyennes des estimations et fractions quotidiennes acceptées, pas l’équation appliquée aux données regroupées. Les moyennes des données utilisent exactement les mêmes dates acceptées.",
  "Zeitraumwerte sind Mittelwerte akzeptierter Tagesschätzungen und Anteile, nicht die Gleichung mit zusammengefassten Eingaben. Eingabemittelwerte verwenden genau dieselben akzeptierten Tage.",
  "Os valores do período são médias das estimativas e frações diárias aceitas, não a equação aplicada aos dados agrupados. As médias dos dados usam exatamente as mesmas datas aceitas."
 ]
];
const coefficient=["The reference formula uses 0.0946; the cited research equation uses 0.0964. This estimate uses the 0.0946 coefficient.", "La formule de référence utilise 0,0946 ; l’équation de l’étude citée utilise 0,0964. Cette estimation utilise le coefficient 0,0946.", "Das Cronometer-Handbuch verwendet 0,0946; die Gleichung der zitierten Studie verwendet 0,0964. Diese Schätzung verwendet den Handbuchkoeffizienten.", "O manual do Cronometer usa 0,0946; a equação da pesquisa citada usa 0,0964. Esta estimativa usa o coeficiente do manual."];
export const balanceGuidanceMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze({...Object.fromEntries(rows.map(([key,...values])=>['balanceGuidance.'+key,index===0?balanceGuidance[key]:values[index-1]])),'balanceGuidance.coefficient':coefficient[index]})])));
