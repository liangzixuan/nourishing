const rows=[
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
  "days",
  "Days to include",
  "Jours à inclure",
  "Einzubeziehende Tage",
  "Dias a incluir"
 ],
 [
  "filter.all",
  "All days",
  "Tous les jours",
  "Alle Tage",
  "Todos os dias"
 ],
 [
  "filter.nonempty",
  "Non-empty days",
  "Jours non vides",
  "Tage mit Einträgen",
  "Dias com registros"
 ],
 [
  "filter.complete",
  "Complete days",
  "Jours terminés",
  "Abgeschlossene Tage",
  "Dias concluídos"
 ],
 [
  "today",
  "Include today",
  "Inclure aujourd’hui",
  "Heute einbeziehen",
  "Incluir hoje"
 ],
 [
  "supplements",
  "Include supplements",
  "Inclure les compléments",
  "Nahrungsergänzungsmittel einbeziehen",
  "Incluir suplementos"
 ],
 [
  "supplementHelp",
  "Unchecking excludes foods you marked Supplement. Unclassified items remain included.",
  "Décochez pour exclure les aliments marqués comme compléments. Les éléments non classés restent inclus.",
  "Deaktiviere dies, um als Nahrungsergänzungsmittel markierte Lebensmittel auszuschließen. Nicht klassifizierte Einträge bleiben enthalten.",
  "Desmarcar exclui os alimentos marcados como suplementos. Itens não classificados continuam incluídos."
 ],
 [
  "apply",
  "Apply",
  "Appliquer",
  "Anwenden",
  "Aplicar"
 ],
 [
  "download",
  "Download captured CSV",
  "Télécharger le CSV enregistré",
  "Erfasste CSV herunterladen",
  "Baixar CSV registrado"
 ],
 [
  "balanceDownload",
  "Download balance CSV",
  "Télécharger le CSV des équilibres",
  "Verhältnis-CSV herunterladen",
  "Baixar CSV dos equilíbrios"
 ],
 [
  "scoreDownload",
  "Download score CSV",
  "Télécharger le CSV des scores",
  "Score-CSV herunterladen",
  "Baixar CSV das pontuações"
 ],
 [
  "completenessDownload",
  "Download completeness CSV",
  "Télécharger le CSV de complétude",
  "Vollständigkeits-CSV herunterladen",
  "Baixar CSV da completude"
 ],
 [
  "cancel",
  "Cancel export",
  "Annuler l’exportation",
  "Export abbrechen",
  "Cancelar exportação"
 ],
 [
  "changed",
  "Filters changed. Apply to load them. The displayed report and CSV keep their applied options.",
  "Filtres modifiés. Appliquez pour les charger. Le rapport affiché et le CSV conservent les options appliquées.",
  "Filter geändert. Wende sie an, um sie zu laden. Der angezeigte Bericht und die CSV behalten ihre angewandten Optionen.",
  "Filtros alterados. Aplique para carregá-los. O relatório exibido e o CSV mantêm as opções aplicadas."
 ],
 [
  "canceled",
  "Export canceled. Your report is still available.",
  "Exportation annulée. Votre rapport reste disponible.",
  "Export abgebrochen. Dein Bericht bleibt verfügbar.",
  "Exportação cancelada. Seu relatório continua disponível."
 ],
 [
  "saved",
  "Showing the saved capture. Apply to read a fresh report.",
  "Affichage du rapport enregistré. Appliquez pour lire un nouveau rapport.",
  "Die gespeicherte Fassung wird angezeigt. Wende die Optionen an, um einen neuen Bericht zu lesen.",
  "Exibindo o registro salvo. Aplique para ler um novo relatório."
 ],
 [
  "reading",
  "Reading a fresh report. The previous capture stays available until this read succeeds.",
  "Lecture d’un nouveau rapport. La version précédente reste disponible jusqu’à la réussite de cette lecture.",
  "Ein neuer Bericht wird gelesen. Die vorherige Fassung bleibt bis zum erfolgreichen Abschluss verfügbar.",
  "Lendo um novo relatório. O registro anterior fica disponível até a leitura ser concluída."
 ],
 [
  "notApplied",
  "No new report was applied. Use Apply to refresh.",
  "Aucun nouveau rapport n’a été appliqué. Utilisez Appliquer pour actualiser.",
  "Es wurde kein neuer Bericht angewandt. Verwende Anwenden zum Aktualisieren.",
  "Nenhum novo relatório foi aplicado. Use Aplicar para atualizar."
 ],
 [
  "applied",
  "Applied the captured report. Later filter edits do not change its CSV.",
  "Rapport enregistré appliqué. Les modifications ultérieures des filtres ne changent pas son CSV.",
  "Der erfasste Bericht wurde angewandt. Spätere Filteränderungen ändern seine CSV nicht.",
  "Relatório registrado aplicado. Alterações posteriores dos filtros não mudam seu CSV."
 ],
 [
  "access",
  "Report access is unavailable. The previous capture and download have been cleared.",
  "L’accès au rapport est indisponible. La version précédente et son téléchargement ont été effacés.",
  "Der Berichtszugriff ist nicht verfügbar. Die vorherige Fassung und der Download wurden entfernt.",
  "O acesso ao relatório está indisponível. O registro anterior e o download foram removidos."
 ],
 [
  "readFailed",
  "The read failed. The previous report and its CSV remain applied.",
  "La lecture a échoué. Le rapport précédent et son CSV restent appliqués.",
  "Das Lesen ist fehlgeschlagen. Der vorherige Bericht und seine CSV bleiben angewandt.",
  "A leitura falhou. O relatório anterior e seu CSV continuam aplicados."
 ],
 [
  "none",
  "No report has been applied.",
  "Aucun rapport n’a été appliqué.",
  "Es wurde kein Bericht angewandt.",
  "Nenhum relatório foi aplicado."
 ],
 [
  "readError",
  "The report could not be read.",
  "Le rapport n’a pas pu être lu.",
  "Der Bericht konnte nicht gelesen werden.",
  "Não foi possível ler o relatório."
 ],
 [
  "error.response",
  "The report response was incomplete. The previous report and CSV remain available.",
  "La réponse du rapport était incomplète. Le rapport précédent et son CSV restent disponibles.",
  "Die Berichtsantwort war unvollständig. Der vorherige Bericht und seine CSV bleiben verfügbar.",
  "A resposta do relatório estava incompleta. O relatório anterior e seu CSV continuam disponíveis."
 ],
 [
  "error.supplements",
  "The captured supplement-filter details were incomplete. The previous report and CSV remain available.",
  "Les détails enregistrés du filtre des compléments étaient incomplets. Le rapport précédent et son CSV restent disponibles.",
  "Die erfassten Details des Ergänzungsmittelfilters waren unvollständig. Der vorherige Bericht und seine CSV bleiben verfügbar.",
  "Os detalhes registrados do filtro de suplementos estavam incompletos. O relatório anterior e seu CSV continuam disponíveis."
 ],
 [
  "error.dates",
  "The captured report dates were incomplete. The previous report and downloads remain available.",
  "Les dates enregistrées du rapport étaient incomplètes. Le rapport précédent et ses téléchargements restent disponibles.",
  "Die erfassten Berichtsdaten waren unvollständig. Der vorherige Bericht und seine Downloads bleiben verfügbar.",
  "As datas registradas do relatório estavam incompletas. O relatório anterior e seus downloads continuam disponíveis."
 ],
 [
  "error.balanceDates",
  "The balance dates do not match the captured report.",
  "Les dates des équilibres ne correspondent pas au rapport enregistré.",
  "Die Verhältnisdatumswerte stimmen nicht mit dem erfassten Bericht überein.",
  "As datas dos equilíbrios não correspondem ao relatório registrado."
 ],
 [
  "error.nutrients",
  "The report nutrient details were incomplete. The previous report and CSV remain available.",
  "Les détails nutritionnels du rapport étaient incomplets. Le rapport précédent et son CSV restent disponibles.",
  "Die Nährstoffdetails des Berichts waren unvollständig. Der vorherige Bericht und seine CSV bleiben verfügbar.",
  "Os detalhes de nutrientes do relatório estavam incompletos. O relatório anterior e seu CSV continuam disponíveis."
 ],
 [
  "preparing",
  "Preparing the captured CSV…",
  "Préparation du CSV enregistré…",
  "Erfasste CSV wird vorbereitet…",
  "Preparando o CSV registrado…"
 ],
 [
  "prepareError",
  "The CSV could not be prepared. Try downloading it again.",
  "Le CSV n’a pas pu être préparé. Réessayez de le télécharger.",
  "Die CSV konnte nicht vorbereitet werden. Versuche den Download erneut.",
  "Não foi possível preparar o CSV. Tente baixá-lo novamente."
 ],
 [
  "receiveError",
  "The CSV could not be received. Try downloading it again.",
  "Le CSV n’a pas pu être reçu. Réessayez de le télécharger.",
  "Die CSV konnte nicht empfangen werden. Versuche den Download erneut.",
  "Não foi possível receber o CSV. Tente baixá-lo novamente."
 ],
 [
  "responseError",
  "The CSV response was incomplete. Try downloading it again.",
  "La réponse CSV était incomplète. Réessayez de la télécharger.",
  "Die CSV-Antwort war unvollständig. Versuche den Download erneut.",
  "A resposta CSV estava incompleta. Tente baixá-la novamente."
 ],
 [
  "workerError",
  "{{message}} Try downloading it again.",
  "{{message}} Réessayez de le télécharger.",
  "{{message}} Versuche den Download erneut.",
  "{{message}} Tente baixá-lo novamente."
 ],
 [
  "ready",
  "CSV ready.",
  "CSV prêt.",
  "CSV bereit.",
  "CSV pronto."
 ],
 [
  "title",
  "Applied average nutrition report",
  "Rapport nutritionnel moyen appliqué",
  "Angewandter Bericht zur mittleren Nährstoffaufnahme",
  "Relatório aplicado de nutrição média"
 ],
 [
  "options",
  "{{from}} through {{to}} · {{filter}} · Today {{today}} · Supplements {{supplements}}",
  "Du {{from}} au {{to}} · {{filter}} · Aujourd’hui : {{today}} · Compléments : {{supplements}}",
  "{{from}} bis {{to}} · {{filter}} · Heute: {{today}} · Ergänzungsmittel: {{supplements}}",
  "De {{from}} a {{to}} · {{filter}} · Hoje: {{today}} · Suplementos: {{supplements}}"
 ],
 [
  "included",
  "included",
  "inclus",
  "einbezogen",
  "incluídos"
 ],
 [
  "excluded",
  "excluded",
  "exclus",
  "ausgeschlossen",
  "excluídos"
 ],
 [
  "calendar",
  "Captured {{asOf}}. Workspace calendar: {{timeZone}}; today is {{today}}. The browser timezone does not set this date.",
  "Enregistré le {{asOf}}. Calendrier de l’espace : {{timeZone}} ; aujourd’hui est le {{today}}. Le fuseau du navigateur ne détermine pas cette date.",
  "Erfasst am {{asOf}}. Arbeitsbereichskalender: {{timeZone}}; heute ist {{today}}. Die Browserzeitzone legt dieses Datum nicht fest.",
  "Registrado em {{asOf}}. Calendário do espaço de trabalho: {{timeZone}}; hoje é {{today}}. O fuso horário do navegador não define essa data."
 ],
 [
  "count.requestedDays",
  "Requested days",
  "Jours demandés",
  "Angefragte Tage",
  "Dias solicitados"
 ],
 [
  "count.excludedTodayDays",
  "Today excluded",
  "Aujourd’hui exclu",
  "Heute ausgeschlossen",
  "Hoje excluído"
 ],
 [
  "count.excludedByFilterDays",
  "Excluded by day filter",
  "Exclus par le filtre de jours",
  "Durch Tagesfilter ausgeschlossen",
  "Excluídos pelo filtro de dias"
 ],
 [
  "count.eligibleDays",
  "Eligible days",
  "Jours admissibles",
  "Berücksichtigte Tage",
  "Dias elegíveis"
 ],
 [
  "supplementTitle",
  "Captured supplement inclusion",
  "Inclusion des compléments enregistrée",
  "Erfasste Ergänzungsmittelauswahl",
  "Inclusão de suplementos registrada"
 ],
 [
  "supplementCounts",
  "Unclassified items remain included. Counts describe logical food contributions on eligible dates; repeated ingredients count each time.",
  "Les éléments non classés restent inclus. Les comptes décrivent les contributions alimentaires logiques aux dates admissibles ; chaque répétition d’ingrédient compte.",
  "Nicht klassifizierte Einträge bleiben enthalten. Die Anzahlen beschreiben logische Lebensmittelbeiträge an berücksichtigten Tagen; wiederholte Zutaten zählen jedes Mal.",
  "Itens não classificados continuam incluídos. As contagens descrevem contribuições alimentares lógicas nas datas elegíveis; ingredientes repetidos contam a cada vez."
 ],
 [
  "supplement.includedFoodContributions",
  "Food contributions included",
  "Contributions alimentaires incluses",
  "Einbezogene Lebensmittelbeiträge",
  "Contribuições alimentares incluídas"
 ],
 [
  "supplement.includedSupplementContributions",
  "Supplement contributions included",
  "Contributions de compléments incluses",
  "Einbezogene Ergänzungsmittelbeiträge",
  "Contribuições de suplementos incluídas"
 ],
 [
  "supplement.includedUnclassifiedContributions",
  "Unclassified contributions included",
  "Contributions non classées incluses",
  "Einbezogene nicht klassifizierte Beiträge",
  "Contribuições não classificadas incluídas"
 ],
 [
  "supplement.excludedSupplementContributions",
  "Supplement contributions excluded",
  "Contributions de compléments exclues",
  "Ausgeschlossene Ergänzungsmittelbeiträge",
  "Contribuições de suplementos excluídas"
 ],
 [
  "supplement.filteredEmptyDays",
  "Days empty after filtering",
  "Jours vides après filtrage",
  "Nach Filterung leere Tage",
  "Dias vazios após a filtragem"
 ],
 [
  "means",
  "Means use only known intake days for each nutrient. Partial values contain measured amounts only. Completion zeros are explicit empty-day zeros, not measured food values. Unknown intake is excluded from the mean.",
  "Les moyennes utilisent uniquement les jours d’apport connu de chaque nutriment. Les valeurs partielles ne contiennent que les quantités mesurées. Les zéros de clôture sont des zéros explicites de jours vides, pas des valeurs alimentaires mesurées. L’apport inconnu est exclu de la moyenne.",
  "Mittelwerte verwenden nur Tage mit bekannter Aufnahme des jeweiligen Nährstoffs. Teilwerte enthalten nur gemessene Mengen. Abschlussnullen sind ausdrücklich bestätigte Nullen leerer Tage, keine gemessenen Lebensmittelwerte. Unbekannte Aufnahme ist vom Mittelwert ausgeschlossen.",
  "As médias usam apenas dias com consumo conhecido de cada nutriente. Valores parciais contêm somente quantidades medidas. Zeros de conclusão são zeros explícitos de dias vazios, não valores alimentares medidos. Consumo desconhecido é excluído da média."
 ],
 [
  "targets",
  "Average targets use the same known intake days. These are current workspace target rules applied to historical weekdays, not a record of the targets in effect when you logged those dates.",
  "Les objectifs moyens utilisent les mêmes jours d’apport connu. Les règles actuelles de l’espace s’appliquent aux jours de semaine passés ; ce n’est pas un historique des objectifs en vigueur lors des enregistrements.",
  "Mittlere Ziele verwenden dieselben Tage mit bekannter Aufnahme. Aktuelle Zielregeln des Arbeitsbereichs werden auf vergangene Wochentage angewandt; dies ist keine Aufzeichnung der damals geltenden Ziele.",
  "As metas médias usam os mesmos dias com consumo conhecido. São as regras atuais de metas aplicadas aos dias da semana passados, não um registro das metas em vigor quando esses dias foram registrados."
 ],
 [
  "limits",
  "Method and limitations",
  "Méthode et limites",
  "Methode und Grenzen",
  "Método e limitações"
 ],
 [
  "eligibleDates",
  "Eligible dates ({{count}})",
  "Dates admissibles ({{count}})",
  "Berücksichtigte Daten ({{count}})",
  "Datas elegíveis ({{count}})"
 ],
 [
  "logged",
  "Logged",
  "Enregistré",
  "Erfasst",
  "Registrado"
 ],
 [
  "notLogged",
  "No logged records",
  "Aucun enregistrement",
  "Keine Einträge",
  "Sem registros"
 ],
 [
  "complete",
  "Complete",
  "Terminé",
  "Abgeschlossen",
  "Concluído"
 ],
 [
  "incomplete",
  "Incomplete",
  "Non terminé",
  "Nicht abgeschlossen",
  "Não concluído"
 ],
 [
  "balances",
  "Period nutrient balances",
  "Équilibres nutritionnels de la période",
  "Nährstoffverhältnisse des Zeitraums",
  "Equilíbrios de nutrientes do período"
 ],
 [
  "balanceScope",
  "{{from}} through {{to}} · {{filter}} · Supplements {{supplements}}",
  "Du {{from}} au {{to}} · {{filter}} · Compléments : {{supplements}}",
  "{{from}} bis {{to}} · {{filter}} · Ergänzungsmittel: {{supplements}}",
  "De {{from}} a {{to}} · {{filter}} · Suplementos: {{supplements}}"
 ],
 [
  "visible",
  "Visible nutrients",
  "Nutriments visibles",
  "Sichtbare Nährstoffe",
  "Nutrientes visíveis"
 ],
 [
  "hidden",
  "All nutrient rows are hidden. Show nutrients in Nutrient display settings to include them here.",
  "Toutes les lignes de nutriments sont masquées. Affichez des nutriments dans les paramètres d’affichage pour les inclure ici.",
  "Alle Nährstoffzeilen sind verborgen. Blende Nährstoffe in den Anzeigeeinstellungen ein, um sie hier aufzunehmen.",
  "Todas as linhas de nutrientes estão ocultas. Mostre nutrientes nas configurações de exibição para incluí-los aqui."
 ],
 [
  "tableAria",
  "Full nutrient report, scroll horizontally for all columns",
  "Rapport nutritionnel complet, défilez horizontalement pour toutes les colonnes",
  "Vollständiger Nährstoffbericht; horizontal scrollen für alle Spalten",
  "Relatório completo de nutrientes; role na horizontal para ver todas as colunas"
 ],
 [
  "nutrient",
  "Nutrient and unit",
  "Nutriment et unité",
  "Nährstoff und Einheit",
  "Nutriente e unidade"
 ],
 [
  "mean",
  "Mean intake",
  "Apport moyen",
  "Mittlere Aufnahme",
  "Consumo médio"
 ],
 [
  "knownDays",
  "Known / eligible days",
  "Jours connus / admissibles",
  "Bekannte / berücksichtigte Tage",
  "Dias conhecidos / elegíveis"
 ],
 [
  "partialDays",
  "Partial days",
  "Jours partiels",
  "Unvollständig erfasste Tage",
  "Dias parciais"
 ],
 [
  "unknownDays",
  "Unknown days",
  "Jours inconnus",
  "Unbekannte Tage",
  "Dias desconhecidos"
 ],
 [
  "zeroDays",
  "Completion zero days",
  "Jours à zéro par clôture",
  "Durch Abschluss bestätigte Nulltage",
  "Dias com zero por conclusão"
 ],
 [
  "meanTarget",
  "Average target for the same known intake days",
  "Objectif moyen des mêmes jours d’apport connu",
  "Mittleres Ziel für dieselben Tage mit bekannter Aufnahme",
  "Meta média dos mesmos dias com consumo conhecido"
 ],
 [
  "targetDays",
  "Target-known days",
  "Jours à objectif connu",
  "Tage mit bekanntem Ziel",
  "Dias com meta conhecida"
 ],
 [
  "percentTarget",
  "Percent of mean target",
  "Pourcentage de l’objectif moyen",
  "Prozent des mittleren Ziels",
  "Porcentagem da meta média"
 ],
 [
  "reasons",
  "Reasons",
  "Motifs",
  "Gründe",
  "Motivos"
 ],
 [
  "unknown",
  "Unknown",
  "Inconnu",
  "Unbekannt",
  "Desconhecido"
 ],
 [
  "reason.no-known-intake",
  "No known intake",
  "Aucun apport connu",
  "Keine bekannte Aufnahme",
  "Sem consumo conhecido"
 ],
 [
  "reason.missing-target",
  "Missing target",
  "Objectif manquant",
  "Fehlendes Ziel",
  "Meta ausente"
 ],
 [
  "reason.zero-target",
  "Zero target",
  "Objectif nul",
  "Ziel null",
  "Meta zero"
 ],
 [
  "scrollHelp",
  "Scroll the table sideways for day coverage, target comparison and reasons. The CSV contains visible nutrient rows from this same capture. Daily maximum counts compare individual dates, not the displayed mean.",
  "Faites défiler le tableau horizontalement pour voir la couverture, les comparaisons et les motifs. Le CSV contient les lignes visibles de ce même rapport. Les comptes de maximum quotidien comparent les dates individuelles, pas la moyenne affichée.",
  "Scrolle seitlich für Tagesabdeckung, Zielvergleich und Gründe. Die CSV enthält sichtbare Nährstoffzeilen derselben Fassung. Anzahlen täglicher Höchstwerte vergleichen einzelne Tage, nicht den angezeigten Mittelwert.",
  "Role a tabela para os lados para ver cobertura diária, comparação de metas e motivos. O CSV contém as linhas visíveis do mesmo registro. As contagens de máximos diários comparam datas individuais, não a média exibida."
 ],
 [
  "pageEyebrow",
  "Applied nutrition data",
  "Données nutritionnelles appliquées",
  "Angewandte Nährstoffdaten",
  "Dados nutricionais aplicados"
 ],
 [
  "pageTitle",
  "Nutrition report",
  "Rapport nutritionnel",
  "Ernährungsbericht",
  "Relatório nutricional"
 ],
 [
  "pageDescription",
  "Review all nutrient averages, included days and measurement coverage.",
  "Consultez les moyennes de tous les nutriments, les jours inclus et la couverture des mesures.",
  "Prüfe alle Nährstoffmittelwerte, einbezogene Tage und die Messabdeckung.",
  "Confira as médias de todos os nutrientes, os dias incluídos e a cobertura das medições."
 ],
 [
  "print",
  "Print report",
  "Imprimer le rapport",
  "Bericht drucken",
  "Imprimir relatório"
 ]
];
export const nutritionReportMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(rows.map(([key,...values])=>['nutritionReport.'+key,values[index]])))])));
