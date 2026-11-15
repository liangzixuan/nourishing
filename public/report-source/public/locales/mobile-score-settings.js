const rows={
 "title": [
  "Nutrition Scores",
  "Scores nutritionnels",
  "Nährstoffbewertungen",
  "Pontuações nutricionais"
 ],
 "show": [
  "Show Nutrition Scores",
  "Afficher les scores nutritionnels",
  "Nährstoffbewertungen anzeigen",
  "Mostrar pontuações nutricionais"
 ],
 "selected": [
  "Selected Nutrition Scores",
  "Scores nutritionnels sélectionnés",
  "Ausgewählte Nährstoffbewertungen",
  "Pontuações nutricionais selecionadas"
 ],
 "help": [
  "Help",
  "Aide",
  "Hilfe",
  "Ajuda"
 ],
 "close": [
  "Close",
  "Fermer",
  "Schließen",
  "Fechar"
 ],
 "hint": [
  "Choose up to eight scores for your Diary.",
  "Choisissez jusqu’à huit scores pour votre journal.",
  "Wähle bis zu acht Bewertungen für dein Tagebuch.",
  "Escolha até oito pontuações para seu diário."
 ],
 "add": [
  "Add Score",
  "Ajouter un score",
  "Bewertung hinzufügen",
  "Adicionar pontuação"
 ],
 "remove": [
  "Remove Score",
  "Retirer ce score",
  "Bewertung entfernen",
  "Remover pontuação"
 ],
 "other": [
  "Other Scores",
  "Autres scores",
  "Weitere Bewertungen",
  "Outras pontuações"
 ],
 "saving": [
  "Saving…",
  "Enregistrement…",
  "Wird gespeichert…",
  "Salvando…"
 ],
 "saved": [
  "Scores saved.",
  "Scores enregistrés.",
  "Bewertungen gespeichert.",
  "Pontuações salvas."
 ],
 "reload": [
  "Reload",
  "Recharger",
  "Neu laden",
  "Recarregar"
 ],
 "unknown": [
  "Reload to check the saved selection.",
  "Rechargez pour vérifier la sélection enregistrée.",
  "Neu laden, um die gespeicherte Auswahl zu prüfen.",
  "Recarregue para verificar a seleção salva."
 ],
 "blood": [
  "Blood Health",
  "Santé du sang",
  "Blutgesundheit",
  "Saúde do sangue"
 ],
 "oral": [
  "Oral Health",
  "Santé bucco-dentaire",
  "Mundgesundheit",
  "Saúde bucal"
 ],
 "dataQuality": [
  "Data Quality",
  "Qualité des données",
  "Datenqualität",
  "Qualidade dos dados"
 ],
 "keto": [
  "Ketogenic Score",
  "Score cétogène",
  "Ketogene Bewertung",
  "Pontuação cetogênica"
 ],
 "plant": [
  "Plant-based Diet",
  "Alimentation végétale",
  "Pflanzliche Ernährung",
  "Alimentação vegetal"
 ],
 "womens": [
  "Women’s Health",
  "Santé des femmes",
  "Frauengesundheit",
  "Saúde da mulher"
 ],
 "mens": [
  "Men’s Health",
  "Santé des hommes",
  "Männergesundheit",
  "Saúde do homem"
 ],
 "calciumAbsorption": [
  "Calcium Absorption",
  "Absorption du calcium",
  "Kalziumaufnahme",
  "Absorção de cálcio"
 ]
};
export const mobileScoreMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,i)=>[language,Object.fromEntries(Object.entries(rows).map(([key,values])=>['mobileScoreSettings.'+key,values[i]]))]));
