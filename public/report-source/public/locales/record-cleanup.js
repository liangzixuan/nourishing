const rows=[
 [
  "title",
  "Delete selected diary records",
  "Supprimer les enregistrements sélectionnés du journal",
  "Tagebuch: Auswahl löschen",
  "Excluir registros selecionados do diário"
 ],
 [
  "intro",
  "Choose a date range and record types, then preview the exact counts. Nothing is deleted until you confirm the reviewed selection.",
  "Choisissez une période et les types d’enregistrements, puis vérifiez les nombres exacts. Rien n’est supprimé avant votre confirmation.",
  "Wählen Sie einen Zeitraum und Eintragstypen. Prüfen Sie dann die genauen Anzahlen. Erst nach Ihrer Bestätigung wird gelöscht.",
  "Escolha um intervalo de datas e os tipos de registro. Depois, confira as quantidades exatas. Nada é excluído até você confirmar a seleção revisada."
 ],
 [
  "from",
  "From",
  "Du",
  "Von",
  "De"
 ],
 [
  "to",
  "To",
  "Au",
  "Bis",
  "Até"
 ],
 [
  "zone",
  "Time zone",
  "Fuseau horaire",
  "Zeitzone",
  "Fuso horário"
 ],
 [
  "zoneHelp",
  "Fasts use their start date in this time zone. Other records use their diary date.",
  "Les jeûnes utilisent leur date de début dans ce fuseau horaire. Les autres enregistrements utilisent leur date du journal.",
  "Für Fastenzeiten gilt das Startdatum in dieser Zeitzone. Für andere Einträge gilt das Tagebuchdatum.",
  "Os jejuns usam a data de início neste fuso horário. Os outros registros usam a data do diário."
 ],
 [
  "types",
  "Record types",
  "Types d’enregistrements",
  "Eintragstypen",
  "Tipos de registro"
 ],
 [
  "foods",
  "Food diary entries",
  "Entrées alimentaires",
  "Lebensmitteleinträge",
  "Registros de alimentos"
 ],
 [
  "exercises",
  "Exercises",
  "Exercices",
  "Aktivitäten",
  "Exercícios"
 ],
 [
  "biometrics",
  "Biometrics, including water",
  "Mesures corporelles, y compris l’eau",
  "Körperwerte, einschließlich Wasser",
  "Medidas corporais, incluindo água"
 ],
 [
  "notes",
  "Notes",
  "Notes",
  "Notizen",
  "Notas"
 ],
 [
  "fasts",
  "Fasts",
  "Jeûnes",
  "Fastenzeiten",
  "Jejuns"
 ],
 [
  "preview",
  "Preview selected records",
  "Prévisualiser les enregistrements sélectionnés",
  "Ausgewählte Einträge prüfen",
  "Pré-visualizar registros selecionados"
 ],
 [
  "refresh",
  "Refresh selected-record preview",
  "Actualiser l’aperçu de la sélection",
  "Vorschau der Auswahl aktualisieren",
  "Atualizar prévia da seleção"
 ],
 [
  "fixedIntro_one",
  "Review {{count}} selected diary record from {{date}}. Deletion requires confirmation.",
  "Vérifiez {{count}} enregistrement sélectionné du {{date}}. La suppression nécessite une confirmation.",
  "Prüfen Sie {{count}} ausgewählten Tagebucheintrag vom {{date}}. Das Löschen erfordert eine Bestätigung.",
  "Revise {{count}} registro selecionado do diário de {{date}}. A exclusão exige confirmação."
 ],
 [
  "fixedIntro_other",
  "Review {{count}} selected diary records from {{date}}. Deletion requires confirmation.",
  "Vérifiez {{count}} enregistrements sélectionnés du {{date}}. La suppression nécessite une confirmation.",
  "Prüfen Sie {{count}} ausgewählte Tagebucheinträge vom {{date}}. Das Löschen erfordert eine Bestätigung.",
  "Revise {{count}} registros selecionados do diário de {{date}}. A exclusão exige confirmação."
 ],
 [
  "unknown",
  "The cleanup outcome is unknown. Do not repeat it. Reload the workspace to check its records and recovery snapshots before starting a new preview.",
  "Le résultat du nettoyage est inconnu. Ne le répétez pas. Rechargez l’espace pour vérifier les enregistrements et les sauvegardes de récupération avant un nouvel aperçu.",
  "Das Ergebnis der Bereinigung ist unbekannt. Wiederholen Sie sie nicht. Laden Sie den Arbeitsbereich neu und prüfen Sie Einträge und Wiederherstellungskopien vor einer neuen Vorschau.",
  "O resultado da limpeza é desconhecido. Não a repita. Recarregue o espaço para conferir os registros e as cópias de recuperação antes de iniciar uma nova prévia."
 ],
 [
  "invalidCounts",
  "The server returned invalid cleanup counts.",
  "Le serveur a renvoyé des nombres de nettoyage invalides.",
  "Der Server hat ungültige Anzahlen zur Bereinigung geliefert.",
  "O servidor retornou quantidades inválidas para a limpeza."
 ],
 [
  "item",
  "Recorded diary item",
  "Élément du journal",
  "Tagebucheintrag",
  "Item registrado no diário"
 ],
 [
  "note",
  "Note",
  "Note",
  "Notiz",
  "Nota"
 ],
 [
  "completedFast",
  "Completed fast",
  "Jeûne terminé",
  "Beendete Fastenzeit",
  "Jejum concluído"
 ],
 [
  "activeFast",
  "Active fast",
  "Jeûne en cours",
  "Laufende Fastenzeit",
  "Jejum em andamento"
 ],
 [
  "changed",
  "Selection changed. Preview it again before deleting.",
  "La sélection a changé. Prévisualisez-la à nouveau avant de supprimer.",
  "Die Auswahl wurde geändert. Prüfen Sie sie vor dem Löschen erneut.",
  "A seleção mudou. Confira uma nova prévia antes de excluir."
 ],
 [
  "invalidDate",
  "Choose a valid inclusive date range.",
  "Choisissez une période valide, dates incluses.",
  "Wählen Sie einen gültigen Zeitraum einschließlich beider Daten.",
  "Escolha um intervalo válido, incluindo as duas datas."
 ],
 [
  "requiredType",
  "Select at least one record type.",
  "Sélectionnez au moins un type d’enregistrement.",
  "Wählen Sie mindestens einen Eintragstyp.",
  "Selecione pelo menos um tipo de registro."
 ],
 [
  "invalidZone",
  "Choose a valid IANA time zone, such as America/Chicago.",
  "Choisissez un fuseau horaire IANA valide, par exemple America/Chicago.",
  "Wählen Sie eine gültige IANA-Zeitzone, zum Beispiel America/Chicago.",
  "Escolha um fuso horário IANA válido, como America/Chicago."
 ],
 [
  "invalidPreview",
  "The server returned an incomplete cleanup preview.",
  "Le serveur a renvoyé un aperçu de nettoyage incomplet.",
  "Der Server hat eine unvollständige Bereinigungsvorschau geliefert.",
  "O servidor retornou uma prévia incompleta da limpeza."
 ],
 [
  "invalidDetails",
  "The server returned incomplete cleanup details.",
  "Le serveur a renvoyé des détails de nettoyage incomplets.",
  "Der Server hat unvollständige Angaben zur Bereinigung geliefert.",
  "O servidor retornou detalhes incompletos da limpeza."
 ],
 [
  "mismatch",
  "The cleanup preview does not match the selected diary records.",
  "L’aperçu ne correspond pas aux enregistrements sélectionnés.",
  "Die Vorschau stimmt nicht mit den ausgewählten Tagebucheinträgen überein.",
  "A prévia não corresponde aos registros selecionados do diário."
 ],
 [
  "review_one",
  "Review {{count}} selected record",
  "Vérifier {{count}} enregistrement sélectionné",
  "{{count}} ausgewählten Eintrag prüfen",
  "Revisar {{count}} registro selecionado"
 ],
 [
  "review_other",
  "Review {{count}} selected records",
  "Vérifier {{count}} enregistrements sélectionnés",
  "{{count}} ausgewählte Einträge prüfen",
  "Revisar {{count}} registros selecionados"
 ],
 [
  "exact",
  "{{date}} · Exact selected records",
  "{{date}} · Enregistrements exacts sélectionnés",
  "{{date}} · Genau die ausgewählten Einträge",
  "{{date}} · Registros exatos selecionados"
 ],
 [
  "range",
  "{{from}} to {{to}} · {{zone}}",
  "Du {{from}} au {{to}} · {{zone}}",
  "{{from}} bis {{to}} · {{zone}}",
  "De {{from}} a {{to}} · {{zone}}"
 ],
 [
  "scope",
  "A recovery snapshot is made before deletion. Food libraries, recipes, meals, schedules and settings stay in the workspace. Source photos, usage history and earlier recovery snapshots are kept; this is not a privacy erase.",
  "Une sauvegarde de récupération est créée avant la suppression. Les bibliothèques alimentaires, recettes, repas, programmations et réglages restent dans l’espace. Les photos sources, l’historique d’utilisation et les sauvegardes antérieures sont conservés ; cette action n’efface pas toutes les données privées.",
  "Vor dem Löschen wird eine Wiederherstellungskopie erstellt. Lebensmittelbibliotheken, Rezepte, Mahlzeiten, Zeitpläne und Einstellungen bleiben erhalten. Quellfotos, Nutzungsverlauf und frühere Wiederherstellungskopien bleiben ebenfalls erhalten; diese Aktion löscht nicht alle privaten Daten.",
  "Uma cópia de recuperação é criada antes da exclusão. Bibliotecas de alimentos, receitas, refeições, programações e configurações permanecem no espaço. Fotos de origem, histórico de uso e cópias anteriores são mantidos; esta ação não apaga todos os dados privados."
 ],
 [
  "offline",
  "Offline copies become stale and must refresh. Their pending changes are kept for review.",
  "Les copies hors ligne deviennent obsolètes et doivent être actualisées. Leurs modifications en attente sont conservées pour vérification.",
  "Offline-Kopien veralten und müssen aktualisiert werden. Ausstehende Änderungen bleiben zur Prüfung erhalten.",
  "As cópias offline ficam desatualizadas e devem ser atualizadas. As alterações pendentes são mantidas para revisão."
 ],
 [
  "active_one",
  "This selection includes {{count}} active fast. Deleting it stops tracking that fast.",
  "Cette sélection comprend {{count}} jeûne en cours. Sa suppression arrête son suivi.",
  "Diese Auswahl enthält {{count}} laufende Fastenzeit. Durch das Löschen endet deren Erfassung.",
  "Esta seleção inclui {{count}} jejum em andamento. Excluí-lo interrompe seu acompanhamento."
 ],
 [
  "active_other",
  "This selection includes {{count}} active fasts. Deleting them stops tracking those fasts.",
  "Cette sélection comprend {{count}} jeûnes en cours. Leur suppression arrête leur suivi.",
  "Diese Auswahl enthält {{count}} laufende Fastenzeiten. Durch das Löschen endet deren Erfassung.",
  "Esta seleção inclui {{count}} jejuns em andamento. Excluí-los interrompe seu acompanhamento."
 ],
 [
  "health_one",
  "{{count}} imported health record is selected. Future imports from Health Connect can bring those records back.",
  "{{count}} enregistrement de santé importé est sélectionné. De futurs imports Health Connect peuvent rétablir ces enregistrements.",
  "{{count}} importierter Gesundheitseintrag ist ausgewählt. Künftige Health-Connect-Importe können diese Einträge wiederherstellen.",
  "{{count}} registro de saúde importado foi selecionado. Importações futuras do Health Connect podem trazer esses registros de volta."
 ],
 [
  "health_other",
  "{{count}} imported health records are selected. Future imports from Health Connect can bring those records back.",
  "{{count}} enregistrements de santé importés sont sélectionnés. De futurs imports Health Connect peuvent rétablir ces enregistrements.",
  "{{count}} importierte Gesundheitseinträge sind ausgewählt. Künftige Health-Connect-Importe können diese Einträge wiederherstellen.",
  "{{count}} registros de saúde importados foram selecionados. Importações futuras do Health Connect podem trazer esses registros de volta."
 ],
 [
  "repeat_one",
  "{{count}} selected food entry is linked to repeats. Repeat schedules stay available for reviewed re-logging.",
  "{{count}} entrée alimentaire sélectionnée est liée à une répétition. Les programmations restent disponibles pour un nouvel ajout après vérification.",
  "{{count}} ausgewählter Lebensmitteleintrag ist mit Wiederholungen verknüpft. Die Zeitpläne bleiben zur geprüften erneuten Erfassung verfügbar.",
  "{{count}} registro de alimento selecionado está vinculado a repetições. As programações continuam disponíveis para novo registro após revisão."
 ],
 [
  "repeat_other",
  "{{count}} selected food entries are linked to repeats. Repeat schedules stay available for reviewed re-logging.",
  "{{count}} entrées alimentaires sélectionnées sont liées à des répétitions. Les programmations restent disponibles pour un nouvel ajout après vérification.",
  "{{count}} ausgewählte Lebensmitteleinträge sind mit Wiederholungen verknüpft. Die Zeitpläne bleiben zur geprüften erneuten Erfassung verfügbar.",
  "{{count}} registros de alimentos selecionados estão vinculados a repetições. As programações continuam disponíveis para novo registro após revisão."
 ],
 [
  "invalidExamples",
  "The server returned invalid cleanup examples.",
  "Le serveur a renvoyé des exemples de nettoyage invalides.",
  "Der Server hat ungültige Beispiele zur Bereinigung geliefert.",
  "O servidor retornou exemplos inválidos para a limpeza."
 ],
 [
  "examples_one",
  "{{label}}: {{count}} example of {{total}}",
  "{{label}} : {{count}} exemple sur {{total}}",
  "{{label}}: {{count}} Beispiel von {{total}}",
  "{{label}}: {{count}} exemplo de {{total}}"
 ],
 [
  "examples_other",
  "{{label}}: {{count}} examples of {{total}}",
  "{{label}} : {{count}} exemples sur {{total}}",
  "{{label}}: {{count}} Beispiele von {{total}}",
  "{{label}}: {{count}} exemplos de {{total}}"
 ],
 [
  "confirm_one",
  "I reviewed this {{count}} record ({{summary}}) and understand the deletion scope and recovery snapshot.",
  "J’ai vérifié cet enregistrement ({{count}} ; {{summary}}) et je comprends la portée de la suppression et la sauvegarde de récupération.",
  "Ich habe diesen {{count}} Eintrag ({{summary}}) geprüft und verstehe den Löschumfang und die Wiederherstellungskopie.",
  "Revisei este {{count}} registro ({{summary}}) e entendo o alcance da exclusão e a cópia de recuperação."
 ],
 [
  "confirm_other",
  "I reviewed these {{count}} records ({{summary}}) and understand the deletion scope and recovery snapshot.",
  "J’ai vérifié ces {{count}} enregistrements ({{summary}}) et je comprends la portée de la suppression et la sauvegarde de récupération.",
  "Ich habe diese {{count}} Einträge ({{summary}}) geprüft und verstehe den Löschumfang und die Wiederherstellungskopie.",
  "Revisei estes {{count}} registros ({{summary}}) e entendo o alcance da exclusão e a cópia de recuperação."
 ],
 [
  "delete",
  "Delete selected records",
  "Supprimer les enregistrements sélectionnés",
  "Ausgewählte Einträge löschen",
  "Excluir registros selecionados"
 ],
 [
  "empty",
  "No matching records. Change the selection if you need another preview.",
  "Aucun enregistrement correspondant. Modifiez la sélection pour un autre aperçu.",
  "Keine passenden Einträge. Ändern Sie die Auswahl für eine weitere Vorschau.",
  "Nenhum registro correspondente. Altere a seleção para obter outra prévia."
 ],
 [
  "loading",
  "Loading a read-only preview…",
  "Chargement d’un aperçu en lecture seule…",
  "Schreibgeschützte Vorschau wird geladen…",
  "Carregando uma prévia somente para leitura…"
 ],
 [
  "previewOnly",
  "Preview only. No records have changed.",
  "Aperçu uniquement. Aucun enregistrement n’a changé.",
  "Nur Vorschau. Keine Einträge wurden geändert.",
  "Apenas prévia. Nenhum registro foi alterado."
 ],
 [
  "previewFailed",
  "The preview could not finish.",
  "L’aperçu n’a pas pu être terminé.",
  "Die Vorschau konnte nicht abgeschlossen werden.",
  "Não foi possível concluir a prévia."
 ],
 [
  "notSent",
  "Preview was not confirmed. No deletion was sent.",
  "L’aperçu n’a pas été confirmé. Aucune suppression n’a été envoyée.",
  "Die Vorschau wurde nicht bestätigt. Es wurde kein Löschauftrag gesendet.",
  "A prévia não foi confirmada. Nenhuma exclusão foi enviada."
 ],
 [
  "deleted_one",
  "Deleted {{count}} selected record",
  "{{count}} enregistrement sélectionné supprimé",
  "{{count}} ausgewählten Eintrag gelöscht",
  "{{count}} registro selecionado excluído"
 ],
 [
  "deleted_other",
  "Deleted {{count}} selected records",
  "{{count}} enregistrements sélectionnés supprimés",
  "{{count}} ausgewählte Einträge gelöscht",
  "{{count}} registros selecionados excluídos"
 ],
 [
  "snapshot",
  "Recovery snapshot:",
  "Sauvegarde de récupération :",
  "Wiederherstellungskopie:",
  "Cópia de recuperação:"
 ],
 [
  "recoveryHelp",
  "Use the recovery tools to inspect snapshots. Offline copies must refresh; pending changes remain for review.",
  "Utilisez les outils de récupération pour examiner les sauvegardes. Les copies hors ligne doivent être actualisées ; les modifications en attente restent à vérifier.",
  "Prüfen Sie die Kopien mit den Wiederherstellungswerkzeugen. Offline-Kopien müssen aktualisiert werden; ausstehende Änderungen bleiben zur Prüfung erhalten.",
  "Use as ferramentas de recuperação para conferir as cópias. As cópias offline devem ser atualizadas; as alterações pendentes permanecem para revisão."
 ],
 [
  "deleting",
  "Deleting the reviewed records and making a recovery snapshot…",
  "Suppression des enregistrements vérifiés et création d’une sauvegarde de récupération…",
  "Geprüfte Einträge werden gelöscht und eine Wiederherstellungskopie wird erstellt…",
  "Excluindo os registros revisados e criando uma cópia de recuperação…"
 ],
 [
  "invalidAck",
  "The cleanup acknowledgment was incomplete.",
  "La confirmation du nettoyage était incomplète.",
  "Die Bestätigung der Bereinigung war unvollständig.",
  "A confirmação da limpeza estava incompleta."
 ],
 [
  "complete",
  "Cleanup completed. A new deletion needs a new preview.",
  "Nettoyage terminé. Une nouvelle suppression nécessite un nouvel aperçu.",
  "Bereinigung abgeschlossen. Ein weiterer Löschvorgang erfordert eine neue Vorschau.",
  "Limpeza concluída. Uma nova exclusão exige uma nova prévia."
 ],
 [
  "rejected",
  "The selection was rejected.",
  "La sélection a été refusée.",
  "Die Auswahl wurde abgelehnt.",
  "A seleção foi rejeitada."
 ],
 [
  "retryReview",
  "{{reason}} Preview again and review the current records before deleting.",
  "{{reason}} Prévisualisez à nouveau et vérifiez les enregistrements actuels avant de supprimer.",
  "{{reason}} Erstellen Sie eine neue Vorschau und prüfen Sie die aktuellen Einträge vor dem Löschen.",
  "{{reason}} Gere outra prévia e revise os registros atuais antes de excluir."
 ],
 [
  "notConfirmed",
  "No cleanup was confirmed.",
  "Aucun nettoyage n’a été confirmé.",
  "Es wurde keine Bereinigung bestätigt.",
  "Nenhuma limpeza foi confirmada."
 ],
 [
  "noRetry",
  "No automatic retry will be sent.",
  "Aucune nouvelle tentative automatique ne sera envoyée.",
  "Es wird kein automatischer Wiederholungsversuch gesendet.",
  "Nenhuma nova tentativa automática será enviada."
 ],
 [
  "refreshFailed",
  "Deletion completed, but the workspace view could not refresh. Reload to see the saved records.",
  "Suppression terminée, mais l’affichage n’a pas pu être actualisé. Rechargez pour voir les enregistrements sauvegardés.",
  "Das Löschen wurde abgeschlossen, aber die Ansicht konnte nicht aktualisiert werden. Laden Sie neu, um die gespeicherten Einträge zu sehen.",
  "Exclusão concluída, mas a exibição não pôde ser atualizada. Recarregue para ver os registros salvos."
 ],
 [
  "reloadRequired",
  "Reload the workspace before another deletion.",
  "Rechargez l’espace avant une nouvelle suppression.",
  "Laden Sie den Arbeitsbereich vor einem weiteren Löschvorgang neu.",
  "Recarregue o espaço antes de outra exclusão."
 ],
 [
  "savedOpen",
  "Selected records deleted. Open the diary to refresh its records.",
  "Enregistrements sélectionnés supprimés. Ouvrez le journal pour l’actualiser.",
  "Ausgewählte Einträge gelöscht. Öffnen Sie das Tagebuch, um die Einträge zu aktualisieren.",
  "Registros selecionados excluídos. Abra o diário para atualizar os registros."
 ],
 [
  "savedSnapshot",
  "Selected records deleted. Recovery snapshot {{id}}.",
  "Enregistrements sélectionnés supprimés. Sauvegarde de récupération {{id}}.",
  "Ausgewählte Einträge gelöscht. Wiederherstellungskopie {{id}}.",
  "Registros selecionados excluídos. Cópia de recuperação {{id}}."
 ]
];
export const recordCleanupMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(rows.map(([key,...values])=>['recordCleanup.'+key,values[index]])))])));
