const rows={
 restore:['Restore Defaults','Rétablir les valeurs par défaut','Standardwerte wiederherstellen','Restaurar padrões'],menu:['More options','Plus d’options','Weitere Optionen','Mais opções'],
 body:['Body composition','Composition corporelle','Körperzusammensetzung','Composição corporal'],pending:['Lean body mass','Masse maigre','Fettfreie Körpermasse','Massa magra'],
 missing:['Lean body mass not set','Masse maigre non définie','Fettfreie Körpermasse nicht festgelegt','Massa magra não definida'],
 manual:['Using entered lean body mass','Masse maigre saisie utilisée','Eingegebene fettfreie Körpermasse wird verwendet','Usando massa magra informada'],
 recorded:['Using recorded body measurements','Mesures corporelles enregistrées utilisées','Erfasste Körpermaße werden verwendet','Usando medidas corporais registradas'],
 'recorded-missing':['Selected body measurements unavailable','Mesures corporelles choisies indisponibles','Ausgewählte Körpermaße nicht verfügbar','Medidas corporais selecionadas indisponíveis'],
 details:['Calculation details','Détails du calcul','Berechnungsdetails','Detalhes do cálculo']

};
export const mobileKetoControlsMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,i)=>[language,Object.fromEntries(Object.entries(rows).map(([k,v])=>['mobileKetoControls.'+k,v[i]]))]));
