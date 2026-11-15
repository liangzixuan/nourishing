const rows={
  "formatterUnavailable": [
    "The CSV formatter is unavailable.",
    "Le formateur CSV est indisponible.",
    "Die CSV-Formatierung ist nicht verfügbar.",
    "O formatador CSV está indisponível."
  ],
  "fields": [
    "CSV fields must be an array and rows must be iterable.",
    "Les champs CSV doivent former un tableau et les lignes doivent être itérables.",
    "CSV-Felder müssen ein Array sein und die Zeilen müssen iterierbar sein.",
    "Os campos CSV devem ser uma matriz e as linhas devem ser iteráveis."
  ],
  "row": [
    "Each CSV row must be an array or an object.",
    "Chaque ligne CSV doit être un tableau ou un objet.",
    "Jede CSV-Zeile muss ein Array oder ein Objekt sein.",
    "Cada linha CSV deve ser uma matriz ou um objeto."
  ],
  "reportCapture": [
    "Choose a current captured nutrition report.",
    "Choisissez un rapport nutritionnel capturé à jour.",
    "Wähle einen aktuellen erfassten Ernährungsbericht.",
    "Escolha um relatório nutricional capturado atualizado."
  ],
  "scoreCapture": [
    "Choose a current captured score report.",
    "Choisissez un rapport de scores capturé à jour.",
    "Wähle einen aktuellen erfassten Bewertungsbericht.",
    "Escolha um relatório de pontuações capturado atualizado."
  ],
  "scoreIdentity": [
    "The captured score identity is missing.",
    "L’identité du score capturé est absente.",
    "Die Identität der erfassten Bewertung fehlt.",
    "A identidade da pontuação capturada está ausente."
  ],
  "kind": [
    "Choose a supported report export.",
    "Choisissez un format d’exportation de rapport pris en charge.",
    "Wähle einen unterstützten Berichtsexport.",
    "Escolha uma exportação de relatório compatível."
  ]
};
export const reportExportErrorMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(Object.entries(rows).map(([key,values])=>['reportExportErrors.'+key,values[index]])))])));
