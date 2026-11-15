const rows=[
  ['vitaminD.amount','Vitamin D amount','Quantité de vitamine D','Vitamin-D-Menge','Quantidade de vitamina D'],
  ['vitaminD.unit','Vitamin D unit','Unité de vitamine D','Vitamin-D-Einheit','Unidade de vitamina D'],
  ['vitaminD.micrograms','Micrograms (µg)','Microgrammes (µg)','Mikrogramm (µg)','Microgramas (µg)'],
  ['vitaminD.international','International units (IU)','Unités internationales (IU)','Internationale Einheiten (IU)','Unidades internacionais (IU)'],
  ['vitaminD.empty','Saved in micrograms (µg). 40 IU = 1 µg. Changing units converts the displayed amount.','Enregistré en microgrammes (µg). 40 IU = 1 µg. Le changement d’unité convertit la quantité affichée.','Gespeichert in Mikrogramm (µg). 40 IU = 1 µg. Beim Einheitenwechsel wird die angezeigte Menge umgerechnet.','Salvo em microgramas (µg). 40 IU = 1 µg. A mudança de unidade converte a quantidade exibida.'],
  ['vitaminD.saved','Saved as {{value}} µg per serving. Changing units converts the displayed amount.','Enregistré à {{value}} µg par portion. Le changement d’unité convertit la quantité affichée.','Gespeichert als {{value}} µg pro Portion. Beim Einheitenwechsel wird die angezeigte Menge umgerechnet.','Salvo como {{value}} µg por porção. A mudança de unidade converte a quantidade exibida.'],
];
export const nutrientControlMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(rows.map(row=>[row[0],row[index+1]])))])));
