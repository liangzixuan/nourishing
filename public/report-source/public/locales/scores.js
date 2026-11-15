// Explicit score identities and meanings; no interpretation of English display names.
const groups=[
 ['overall','target','Ensemble des nutriments','Alle Nährstoffe','Todos os nutrientes'],
 ['vitamins','target','Vitamines','Vitamine','Vitaminas'],
 ['minerals','target','Minéraux','Mineralstoffe','Minerais'],
 ['protein','target','Protéines','Protein','Proteínas'],
 ['fiber','target','Fibres','Ballaststoffe','Fibras'],
 ['hydration','target','Eau','Wasser','Água'],
 ['omega3','target','Oméga-3','Omega-3','Ômega-3'],
 ['potassium','target','Potassium','Kalium','Potássio'],
 ['womens','target','Nutriments pour les femmes','Nährstoffe für Frauen','Nutrientes para mulheres'],
 ['mens','target','Nutriments pour les hommes','Nährstoffe für Männer','Nutrientes para homens'],
 ['plant','target','Nutriments de l’alimentation végétale','Nährstoffe bei pflanzlicher Ernährung','Nutrientes da alimentação vegetal'],
 ['electrolytes','target','Électrolytes','Elektrolyte','Eletrólitos'],
 ['antioxidants','target','Antioxydants','Antioxidantien','Antioxidantes'],
 ['immune','target','Nutriments liés à l’immunité','Nährstoffe für das Immunsystem','Nutrientes relacionados à imunidade'],
 ['blood','target','Nutriments liés au sang','Nährstoffe für das Blut','Nutrientes relacionados ao sangue'],
 ['bone','target','Nutriments liés aux os','Nährstoffe für die Knochen','Nutrientes relacionados aos ossos'],
 ['metabolism','target','Nutriments liés au métabolisme','Nährstoffe für den Stoffwechsel','Nutrientes relacionados ao metabolismo'],
 ['perimenopause','target','Nutriments liés à la périménopause','Nährstoffe in der Perimenopause','Nutrientes relacionados à perimenopausa'],
 ['oral','targetLimit','Nutriments liés à la santé buccale','Nährstoffe für die Mundgesundheit','Nutrientes relacionados à saúde bucal'],
 ['keto','targetLimit','Nutriments de l’alimentation cétogène','Nährstoffe bei ketogener Ernährung','Nutrientes da alimentação cetogênica'],
 ['dataQuality','plain','Qualité des données','Datenqualität','Qualidade dos dados'],
 ['calciumAbsorption','score','Absorption du calcium','Calciumresorption','Absorção de cálcio'],
];
export const scoreLabelKinds=Object.freeze(Object.fromEntries(groups.map(([id,kind])=>[id,kind])));
export const scoreGroupLabels=Object.freeze(Object.fromEntries(['fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(groups.map(([id,_kind,...labels])=>[id,labels[index]])))])));
const rows=[
 ['scoreLabel.target','{{name}} target progress','Progression vers les objectifs : {{name}}','Zielerreichung: {{name}}','Progresso das metas: {{name}}'],
 ['scoreLabel.targetLimit','{{name}} target and limit progress','Progression par rapport aux objectifs et aux limites : {{name}}','Zielerreichung und Grenzwerte: {{name}}','Progresso das metas e dos limites: {{name}}'],
 ['scoreLabel.score','{{name}} score','Score : {{name}}','Bewertung: {{name}}','Pontuação: {{name}}'],
];
export const scoreMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(rows.map(([key,...values])=>[key,values[index]])))])));
