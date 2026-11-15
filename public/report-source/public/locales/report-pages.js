// The pagination owner translates controls; captured dates and row values stay literal.
const rows=[
 ['scores','Captured daily scores','Scores quotidiens enregistrés','Erfasste Tageswerte','Pontuações diárias registradas'],
 ['energy','Daily energy facts','Données énergétiques quotidiennes','Tägliche Energiewerte','Dados diários de energia'],
 ['trend-nutrients','Daily nutrient values','Valeurs nutritionnelles quotidiennes','Tägliche Nährstoffwerte','Valores diários de nutrientes'],
 ['summary','{{label}} ({{count}} eligible dates)','{{label}} (dates admissibles : {{count}})','{{label}} (passende Tage: {{count}})','{{label}} (datas elegíveis: {{count}})'],
 ['previous','Previous dates','Dates précédentes','Vorherige Tage','Datas anteriores'],
 ['next','Next dates','Dates suivantes','Nächste Tage','Próximas datas'],
 ['page','Page','Page','Seite','Página'],
 ['pageLabel','{{label}} page','Page : {{label}}','Seite: {{label}}','Página: {{label}}'],
 ['status','Page {{page}} of {{pages}}. Dates {{start}} through {{end}} of {{count}}: {{from}} through {{to}}.','Page {{page}} sur {{pages}}. Dates {{start}} à {{end}} sur {{count}} : du {{from}} au {{to}}.','Seite {{page}} von {{pages}}. Tage {{start}} bis {{end}} von {{count}}: {{from}} bis {{to}}.','Página {{page}} de {{pages}}. Datas {{start}} a {{end}} de {{count}}: de {{from}} a {{to}}.'],
 ['empty','No eligible dates.','Aucune date admissible.','Keine passenden Tage.','Nenhuma data elegível.']
];
export const reportPagesMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.fromEntries(rows.map(([key,...values])=>['reportPages.'+key,values[index]]))]));
