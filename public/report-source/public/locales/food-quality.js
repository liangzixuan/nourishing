import {foodQualityGuidance} from './../../server/food-quality-guidance.mjs';
const rows=[
 [
  "summary",
  "Food entries: {{entries}}. Visible source nutrients: {{nutrients}}.",
  "Entrées alimentaires : {{entries}}. Nutriments sources visibles : {{nutrients}}.",
  "Lebensmitteleinträge: {{entries}}. Sichtbare Quellnährstoffe: {{nutrients}}.",
  "Registros alimentares: {{entries}}. Nutrientes visíveis da fonte: {{nutrients}}."
 ],
 [
  "intro",
  "Recipe ingredients are averaged within each diary entry. This measures available data, not dietary adequacy or measurement accuracy.",
  "Les ingrédients des recettes sont moyennés dans chaque entrée du journal. Cette mesure porte sur les données disponibles, pas sur l’adéquation nutritionnelle ni l’exactitude des mesures.",
  "Rezeptzutaten werden innerhalb jedes Tagebucheintrags gemittelt. Dies misst verfügbare Daten, nicht die bedarfsgerechte Ernährung oder die Messgenauigkeit.",
  "Os ingredientes das receitas são calculados pela média dentro de cada registro do diário. Isso mede os dados disponíveis, não a adequação alimentar nem a precisão das medições."
 ],
 [
  "confidenceCalculation",
  "Score confidence and calculation",
  "Confiance du score et calcul",
  "Datenabdeckung und Berechnung",
  "Confiança da pontuação e cálculo"
 ],
 [
  "availabilityCalculation",
  "Nutrient availability and calculation",
  "Disponibilité des nutriments et calcul",
  "Nährstoffverfügbarkeit und Berechnung",
  "Disponibilidade de nutrientes e cálculo"
 ],
 [
  "scoreConfidence",
  "Score data confidence",
  "Confiance des données du score",
  "Datenabdeckung der Scores",
  "Confiança dos dados da pontuação"
 ],
 [
  "score",
  "Score",
  "Score",
  "Score",
  "Pontuação"
 ],
 [
  "confidence",
  "Confidence",
  "Confiance",
  "Datenabdeckung",
  "Confiança"
 ],
 [
  "nutrients",
  "Nutrients",
  "Nutriments",
  "Nährstoffe",
  "Nutrientes"
 ],
 [
  "visible",
  "Visible nutrient availability",
  "Disponibilité des nutriments visibles",
  "Verfügbarkeit sichtbarer Nährstoffe",
  "Disponibilidade de nutrientes visíveis"
 ],
 [
  "nutrientAvailability",
  "Nutrient data availability",
  "Disponibilité des données nutritionnelles",
  "Verfügbarkeit der Nährstoffdaten",
  "Disponibilidade de dados nutricionais"
 ],
 [
  "nutrient",
  "Nutrient",
  "Nutriment",
  "Nährstoff",
  "Nutriente"
 ],
 [
  "availability",
  "Availability",
  "Disponibilité",
  "Verfügbarkeit",
  "Disponibilidade"
 ],
 [
  "unrounded",
  "Unrounded Data Quality: {{value}}. Food-data completeness remains a separate ingredient-count measure.",
  "Qualité des données non arrondie : {{value}}. La complétude des données alimentaires reste une mesure distincte fondée sur le nombre d’ingrédients.",
  "Ungerundete Datenqualität: {{value}}. Die Vollständigkeit der Lebensmitteldaten bleibt ein separates Maß anhand der Zutatenanzahl.",
  "Qualidade dos dados sem arredondamento: {{value}}. A completude dos dados alimentares continua sendo uma medida separada baseada na contagem de ingredientes."
 ],
 [
  "note.entry-weighting",
  null,
  "La disponibilité issue des sources fait la moyenne des ingrédients de chaque recette ou repas, puis donne le même poids à chaque entrée alimentaire du journal. Les quantités ne pondèrent pas le résultat. Un zéro mesuré est disponible ; les données manquantes restent non mesurées.",
  "Die Verfügbarkeit aus Quelldaten mittelt die Zutaten jeder Rezeptur oder Mahlzeit und gewichtet dann jeden Lebensmitteleintrag gleich. Mengen ändern das Gewicht nicht. Eine gemessene Null ist verfügbar; fehlende Daten bleiben ungemessen.",
  "A disponibilidade derivada das fontes calcula a média dos ingredientes de cada receita ou refeição e dá o mesmo peso a cada registro alimentar. As quantidades não ponderam o resultado. Um zero medido está disponível; dados ausentes continuam não medidos."
 ],
 [
  "note.scope",
  null,
  "La qualité des données utilise les nutriments visibles du registre source, quels que soient les objectifs. La confiance du score utilise ses composantes enregistrées, avec des poids de disponibilité égaux. Aucune de ces valeurs ne mesure l’adéquation nutritionnelle ni l’exactitude des aliments.",
  "Die Datenqualität verwendet sichtbare Nährstoffe des Quellregisters unabhängig von Zielen. Die Datenabdeckung eines Scores verwendet dessen erfasste Komponenten mit gleichen Verfügbarkeitsgewichten. Keiner der Werte misst die bedarfsgerechte Ernährung oder die Richtigkeit von Lebensmitteldaten.",
  "A qualidade dos dados usa os nutrientes visíveis do registro de origem, independentemente das metas. A confiança da pontuação usa seus componentes registrados com pesos iguais de disponibilidade. Nenhum dos valores mede a adequação alimentar nem a precisão dos alimentos."
 ],
 [
  "note.exclusions",
  null,
  "Les entrées d’eau, les notes et les exercices sont exclus. Un contexte sans aliments a une disponibilité nulle. Les compléments exclus ne contribuent pas ; les recettes mixtes conservent leurs ingrédients inclus.",
  "Trinkeinträge, Notizen und Training sind ausgeschlossen. Ohne Lebensmittel ist die Verfügbarkeit null. Ausgeschlossene Nahrungsergänzungsmittel tragen nicht bei; gemischte Rezepte behalten ihre eingeschlossenen Zutaten.",
  "Registros de água, notas e exercícios são excluídos. Contextos sem alimentos têm disponibilidade zero. Suplementos excluídos não contribuem; receitas mistas mantêm os ingredientes incluídos."
 ],
 [
  "note.unresolved",
  null,
  "Un ingrédient non résolu de quantité non nulle utilise les données nutritionnelles du parent. Un ingrédient non résolu de quantité nulle reste dans le dénominateur. Les compositions profondes utilisent les données du parent à la limite de récursion de la source.",
  "Eine nicht aufgelöste Zutat mit einer Menge ungleich null verwendet die Nährstoffdaten des übergeordneten Eintrags. Bei Menge null bleibt sie im Nenner. Tiefe Zusammensetzungen verwenden an der Rekursionsgrenze der Quelle die Daten des übergeordneten Eintrags.",
  "Um ingrediente não resolvido com quantidade diferente de zero usa os dados nutricionais do item pai. Um ingrediente não resolvido com quantidade zero permanece no denominador. Composições profundas usam os dados do item pai no limite de recursão da fonte."
 ],
 [
  "note.provenance",
  null,
  "Les fournisseurs locaux ne prouvent pas une identité CRDB. Les noms et étiquettes locales de compléments ne donnent jamais de crédit CRDB aux champs manquants. Les données du parent utilisent des mesures résolues localement ; la normalisation du serveur d’origine et l’équivalence authentifiée restent non vérifiées.",
  "Lokale Anbieter belegen keine CRDB-Identität. Namen und lokale Kennzeichnungen von Nahrungsergänzungsmitteln aktivieren niemals eine CRDB-Gutschrift für fehlende Felder. Übergeordnete Daten verwenden lokal aufgelöste Messwerte; die ursprüngliche Servernormalisierung und die Übereinstimmung mit der angemeldeten Anwendung bleiben ungeprüft.",
  "Fornecedores locais não estabelecem a identidade CRDB. Nomes e rótulos locais de suplementos nunca ativam crédito CRDB para campos ausentes. Os dados do item pai usam medições resolvidas localmente; a normalização do servidor original e a equivalência autenticada continuam não verificadas."
 ],
 [
  "note.completeness",
  null,
  "La complétude des données alimentaires existante compte chaque occurrence d’ingrédient et reste une mesure locale distincte.",
  "Die bestehende Vollständigkeit der Lebensmitteldaten zählt einzelne Zutatenvorkommen und bleibt ein separates lokales Maß.",
  "A completude dos dados alimentares existente conta cada ocorrência de ingrediente e continua sendo uma medida local separada."
 ]
];
export const foodQualityMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(rows.map(([key,...values])=>['foodQuality.'+key,(index===0&&key.startsWith('note.')?foodQualityGuidance[key.slice(5)]:values[index])])))])));
