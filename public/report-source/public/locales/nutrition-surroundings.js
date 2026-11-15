const rows={
  "breakdown": [
    "Nutrient breakdown",
    "Détail des nutriments",
    "Nährstoffübersicht",
    "Detalhamento de nutrientes"
  ],
  "intakeTargets": [
    "Recorded intake, daily targets and optional maxima",
    "Apports enregistrés, objectifs quotidiens et maximums facultatifs",
    "Erfasste Aufnahme, Tagesziele und optionale Höchstwerte",
    "Consumo registrado, metas diárias e limites máximos opcionais"
  ],
  "noneVisible": [
    "No nutrients are visible in this view. Change visibility in Targets.",
    "Aucun nutriment n’est visible ici. Modifiez la visibilité dans les objectifs.",
    "In dieser Ansicht sind keine Nährstoffe sichtbar. Ändern Sie die Sichtbarkeit unter Ziele.",
    "Nenhum nutriente está visível nesta tela. Altere a visibilidade em Metas."
  ],
  "balances": [
    "Nutrient balances",
    "Équilibres nutritionnels",
    "Nährstoffverhältnisse",
    "Equilíbrios de nutrientes"
  ],
  "balancesUnavailable": [
    "Nutrient balances are unavailable. Refresh this diary date.",
    "Les équilibres nutritionnels sont indisponibles. Actualisez cette date du journal.",
    "Nährstoffverhältnisse sind nicht verfügbar. Aktualisieren Sie diesen Tagebuchtag.",
    "Os equilíbrios de nutrientes estão indisponíveis. Atualize esta data do diário."
  ],
  "balancesIncomplete": [
    "Nutrient balance data is incomplete. Refresh this diary date.",
    "Les données d’équilibre nutritionnel sont incomplètes. Actualisez cette date du journal.",
    "Die Daten zu Nährstoffverhältnissen sind unvollständig. Aktualisieren Sie diesen Tagebuchtag.",
    "Os dados de equilíbrio de nutrientes estão incompletos. Atualize esta data do diário."
  ],
  "balanceVisibility": [
    "Balance visibility",
    "Visibilité des équilibres",
    "Sichtbarkeit der Verhältnisse",
    "Visibilidade dos equilíbrios"
  ],
  "selectionTitle": [
    "Selected food nutrients",
    "Nutriments des aliments sélectionnés",
    "Nährstoffe der ausgewählten Lebensmittel",
    "Nutrientes dos alimentos selecionados"
  ],
  "dailyTitle": [
    "All daily nutrients",
    "Tous les nutriments du jour",
    "Alle Tagesnährstoffe",
    "Todos os nutrientes do dia"
  ],
  "workspaceFailed": [
    "Could not open your workspace",
    "Impossible d’ouvrir votre espace",
    "Ihr Arbeitsbereich konnte nicht geöffnet werden",
    "Não foi possível abrir seu espaço"
  ],
  "retry": [
    "Try again",
    "Réessayer",
    "Erneut versuchen",
    "Tentar novamente"
  ]
};
export const nutritionSurroundingsMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(Object.entries(rows).map(([key,values])=>['nutritionSurroundings.'+key,values[index]])))])));
