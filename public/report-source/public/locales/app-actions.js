const rows={
  "cleanupUnknown": [
    "Cleanup may have completed. Reload before another cleanup.",
    "Le nettoyage a peut-être été effectué. Rechargez avant un autre nettoyage.",
    "Die Bereinigung wurde möglicherweise abgeschlossen. Laden Sie vor einer weiteren Bereinigung neu.",
    "A limpeza pode ter sido concluída. Recarregue antes de outra limpeza."
  ],
  "fastIncomplete": [
    "The current fasting response is incomplete.",
    "La réponse sur le jeûne en cours est incomplète.",
    "Die Antwort zum aktuellen Fasten ist unvollständig.",
    "A resposta sobre o jejum atual está incompleta."
  ],
  "validDate": [
    "Choose a valid diary date.",
    "Choisissez une date de journal valide.",
    "Wählen Sie ein gültiges Tagebuchdatum.",
    "Escolha uma data válida para o diário."
  ],
  "fastRefresh": [
    "Refresh fasting to update its current status.",
    "Actualisez le jeûne pour mettre à jour son état.",
    "Aktualisieren Sie die Fastenansicht, um den aktuellen Status zu sehen.",
    "Atualize a tela de jejum para ver o estado atual."
  ],
  "diaryRefresh": [
    "Reload to see the current diary.",
    "Rechargez pour voir le journal actuel.",
    "Laden Sie neu, um das aktuelle Tagebuch zu sehen.",
    "Recarregue para ver o diário atual."
  ],
  "groupUnavailable": [
    "This diary group is no longer available.",
    "Ce groupe du journal n’est plus disponible.",
    "Diese Tagebuchgruppe ist nicht mehr verfügbar.",
    "Este grupo do diário não está mais disponível."
  ],
  "shortcutUnavailable": [
    "Choose an available group shortcut.",
    "Choisissez un raccourci de groupe disponible.",
    "Wählen Sie eine verfügbare Gruppenaktion.",
    "Escolha um atalho de grupo disponível."
  ],
  "entryUnavailable": [
    "Entry unavailable.",
    "Entrée indisponible.",
    "Eintrag nicht verfügbar.",
    "Registro indisponível."
  ],
  "recipeUnavailable": [
    "This recipe is no longer available.",
    "Cette recette n’est plus disponible.",
    "Dieses Rezept ist nicht mehr verfügbar.",
    "Esta receita não está mais disponível."
  ],
  "validRange": [
    "Choose a valid date range.",
    "Choisissez une période valide.",
    "Wählen Sie einen gültigen Zeitraum.",
    "Escolha um intervalo de datas válido."
  ],
  "formUnavailable": [
    "This form is not available.",
    "Ce formulaire n’est pas disponible.",
    "Dieses Formular ist nicht verfügbar.",
    "Este formulário não está disponível."
  ],
  "addTo": [
    "Add to {{group}}",
    "Ajouter à {{group}}",
    "Zu {{group}} hinzufügen",
    "Adicionar a {{group}}"
  ],
  "editEntry": [
    "Edit diary entry",
    "Modifier l’entrée du journal",
    "Tagebucheintrag bearbeiten",
    "Editar registro do diário"
  ],
  "name": [
    "Name",
    "Nom",
    "Name",
    "Nome"
  ],
  "amount": [
    "Amount",
    "Quantité",
    "Menge",
    "Quantidade"
  ],
  "group": [
    "Group",
    "Groupe",
    "Gruppe",
    "Grupo"
  ],
  "time": [
    "Time",
    "Heure",
    "Uhrzeit",
    "Horário"
  ],
  "update": [
    "Update entry",
    "Mettre à jour l’entrée",
    "Eintrag aktualisieren",
    "Atualizar registro"
  ],
  "updated": [
    "Entry updated",
    "Entrée mise à jour",
    "Eintrag aktualisiert",
    "Registro atualizado"
  ],
  "recipeCopy": [
    "{{name}} (copy)",
    "{{name}} (copie)",
    "{{name}} (Kopie)",
    "{{name}} (cópia)"
  ],
  "printTitle": [
    "Nourishing nutrition report · {{date}}",
    "Rapport nutritionnel Nourishing · {{date}}",
    "Nourishing-Ernährungsbericht · {{date}}",
    "Relatório nutricional Nourishing · {{date}}"
  ]
};
export const appActionMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(Object.entries(rows).map(([key,values])=>['appActions.'+key,values[index]])))])));
