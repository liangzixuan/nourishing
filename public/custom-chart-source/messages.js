const rows={
create:['Create Custom Chart','Créer un graphique','Eigenes Diagramm erstellen','Criar gráfico personalizado'],
edit:['Edit Custom Chart','Modifier le graphique','Eigenes Diagramm bearbeiten','Editar gráfico personalizado'],
name:['Chart Name','Nom du graphique','Diagrammname','Nome do gráfico'],
primary:['Left Y-Axis','Axe Y gauche','Linke Y-Achse','Eixo Y esquerdo'],
secondary:['Right Y-Axis','Axe Y droit','Rechte Y-Achse','Eixo Y direito'],
biometric:['Biometric','Biométrie','Körperwert','Biometria'],
nutrient:['Nutrient','Nutriment','Nährstoff','Nutriente'],
score:['Score','Score','Bewertung','Pontuação'],
unit:['Biometric Unit','Unité biométrique','Einheit','Unidade biométrica'],
add:['Add Right Y-Axis','Ajouter un axe Y droit','Rechte Y-Achse hinzufügen','Adicionar eixo Y direito'],
remove:['Remove right axis','Supprimer l’axe droit','Rechte Achse entfernen','Remover eixo direito'],
save:['Save Chart','Enregistrer','Diagramm speichern','Salvar gráfico'],
search:['Search','Rechercher','Suchen','Pesquisar'],
back:['Back','Retour','Zurück','Voltar'],
noMatches:['No matches','Aucun résultat','Keine Treffer','Nenhum resultado'],
chooseUnit:['Choose a unit','Choisir une unité','Einheit wählen','Escolher unidade']
};
export const mobileChartEditorMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,i)=>[language,Object.fromEntries(Object.entries(rows).map(([key,values])=>[key,values[i]]))]));
