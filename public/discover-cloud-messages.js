import {mobileChartsMessages} from './health-source/public/locales/mobile-charts.js';
import {snapshotMessages} from './snapshot-source/snapshot-messages.js';
import {mobileChartEditorMessages} from './custom-chart-source/messages.js';
import {createUITranslator} from './app-language.js';
// Cloud-owned UI messages. User names, source descriptions and saved values are not translated.
const rows=[
 [
  "activityKcal",
  "Activity (kcal)",
  "Activité (kcal)",
  "Aktivität (kcal)",
  "Atividade (kcal)"
 ],
 [
  "activityLevel",
  "Activity level",
  "Niveau d’activité",
  "Aktivitätsniveau",
  "Nível de atividade"
 ],
 [
  "bodyActivity",
  "Body & Activity",
  "Corps et activité",
  "Körper und Aktivität",
  "Corpo e atividade"
 ],
 [
  "bmi",
  "Body Mass Index (BMI)",
  "Indice de masse corporelle (IMC)",
  "Body-Mass-Index (BMI)",
  "Índice de massa corporal (IMC)"
 ],
 [
  "breastfeeding",
  "Breastfeeding",
  "Allaitement",
  "Stillzeit",
  "Amamentação"
 ],
 [
  "calciumIntake",
  "Calcium Intake",
  "Apport en calcium",
  "Calciumzufuhr",
  "Ingestão de cálcio"
 ],
 [
  "cancelled",
  "Cancelled.",
  "Annulé.",
  "Abgebrochen.",
  "Cancelado."
 ],
 [
  "carbohydrateGrams",
  "Carbohydrate (g)",
  "Glucides (g)",
  "Kohlenhydrate (g)",
  "Carboidratos (g)"
 ],
 [
  "chart",
  "Chart",
  "Graphique",
  "Diagramm",
  "Gráfico"
 ],
 [
  "choose",
  "Choose",
  "Choisir",
  "Wählen",
  "Escolher"
 ],
 [
  "smallFile",
  "Choose a file smaller than 20 MB.",
  "Choisissez un fichier de moins de 20 Mo.",
  "Wählen Sie eine Datei unter 20 MB.",
  "Escolha um arquivo menor que 20 MB."
 ],
 [
  "dateOrder",
  "Choose an end date after the start date.",
  "Choisissez une date de fin après la date de début.",
  "Wählen Sie ein Enddatum nach dem Startdatum.",
  "Escolha uma data final após a inicial."
 ],
 [
  "closeNutrient",
  "Close nutrient details",
  "Fermer les détails du nutriment",
  "Nährstoffdetails schließen",
  "Fechar detalhes do nutriente"
 ],
 [
  "compare",
  "Compare",
  "Comparer",
  "Vergleichen",
  "Comparar"
 ],
 [
  "photoRead",
  "Could not open this photo.",
  "Impossible d’ouvrir cette photo.",
  "Dieses Foto konnte nicht geöffnet werden.",
  "Não foi possível abrir esta foto."
 ],
 [
  "customCalories",
  "Custom calories",
  "Calories personnalisées",
  "Eigene Kalorien",
  "Calorias personalizadas"
 ],
 [
  "cyclePhases",
  "Cycle Phases",
  "Phases du cycle",
  "Zyklusphasen",
  "Fases do ciclo"
 ],
 [
  "cycleTracking",
  "Cycle Tracking",
  "Suivi du cycle",
  "Zyklusverfolgung",
  "Acompanhamento do ciclo"
 ],
 [
  "cycleObservations",
  "Cycle observations",
  "Observations du cycle",
  "Zyklusbeobachtungen",
  "Observações do ciclo"
 ],
 [
  "dailyNutrients",
  "Daily nutrients",
  "Nutriments quotidiens",
  "Tägliche Nährstoffe",
  "Nutrientes diários"
 ],
 [
  "deleteRecord",
  "Delete this record?",
  "Supprimer cette entrée ?",
  "Diesen Eintrag löschen?",
  "Excluir este registro?"
 ],
 [
  "displayBand",
  "Display band (optional)",
  "Plage affichée (facultatif)",
  "Anzeigebereich (optional)",
  "Faixa exibida (opcional)"
 ],
 [
  "displayUnit",
  "Display unit",
  "Unité affichée",
  "Anzeigeeinheit",
  "Unidade de exibição"
 ],
 [
  "editBiometric",
  "Edit Biometric",
  "Modifier la mesure",
  "Körperwert bearbeiten",
  "Editar biometria"
 ],
 [
  "editExercise",
  "Edit Exercise",
  "Modifier l’exercice",
  "Training bearbeiten",
  "Editar exercício"
 ],
 [
  "bothLimits",
  "Enter both band limits.",
  "Saisissez les deux limites.",
  "Geben Sie beide Bereichsgrenzen ein.",
  "Insira os dois limites da faixa."
 ],
 [
  "equationSex",
  "Equation sex",
  "Sexe utilisé dans l’équation",
  "Geschlecht für die Formel",
  "Sexo usado na fórmula"
 ],
 [
  "exportData",
  "Export Data",
  "Exporter les données",
  "Daten exportieren",
  "Exportar dados"
 ],
 [
  "fatGrams",
  "Fat (g)",
  "Lipides (g)",
  "Fett (g)",
  "Gorduras (g)"
 ],
 [
  "female",
  "Female",
  "Féminin",
  "Weiblich",
  "Feminino"
 ],
 [
  "male",
  "Male",
  "Masculin",
  "Männlich",
  "Masculino"
 ],
 [
  "fileFormat",
  "File format",
  "Format du fichier",
  "Dateiformat",
  "Formato do arquivo"
 ],
 [
  "glucoseInsulin",
  "Glucose & insulin sources",
  "Sources de glucose et d’insuline",
  "Glukose- und Insulinquellen",
  "Fontes de glicose e insulina"
 ],
 [
  "glucoseSources",
  "Glucose Sources",
  "Sources de glucose",
  "Glukosequellen",
  "Fontes de glicose"
 ],
 [
  "glucoseTimeline",
  "Glucose Timeline",
  "Évolution du glucose",
  "Glukoseverlauf",
  "Histórico de glicose"
 ],
 [
  "glucoseSource",
  "Glucose source",
  "Source de glucose",
  "Glukosequelle",
  "Fonte de glicose"
 ],
 [
  "adultEquation",
  "Healthy adult equation (19+)",
  "Équation pour adultes en bonne santé (19+)",
  "Formel für gesunde Erwachsene (ab 19)",
  "Fórmula para adultos saudáveis (19+)"
 ],
 [
  "reviewedTargets",
  "I reviewed these targets.",
  "J’ai vérifié ces objectifs.",
  "Ich habe diese Ziele geprüft.",
  "Revisei estas metas."
 ],
 [
  "importCycle",
  "Import cycle file",
  "Importer un fichier de cycle",
  "Zyklusdatei importieren",
  "Importar arquivo de ciclo"
 ],
 [
  "insulinSource",
  "Insulin source",
  "Source d’insuline",
  "Insulinquelle",
  "Fonte de insulina"
 ],
 [
  "lightActivity",
  "Lightly active",
  "Légèrement actif",
  "Leicht aktiv",
  "Levemente ativo"
 ],
 [
  "moderateActivity",
  "Moderately active",
  "Modérément actif",
  "Mäßig aktiv",
  "Moderadamente ativo"
 ],
 [
  "loadingChart",
  "Loading chart…",
  "Chargement du graphique…",
  "Diagramm wird geladen…",
  "Carregando gráfico…"
 ],
 [
  "lower",
  "Lower",
  "Minimum",
  "Untergrenze",
  "Inferior"
 ],
 [
  "upper",
  "Upper",
  "Maximum",
  "Obergrenze",
  "Superior"
 ],
 [
  "noCycle",
  "No cycle observations",
  "Aucune observation du cycle",
  "Keine Zyklusbeobachtungen",
  "Nenhuma observação do ciclo"
 ],
 [
  "noObservations",
  "No observations in this date range",
  "Aucune observation sur cette période",
  "Keine Beobachtungen in diesem Zeitraum",
  "Nenhuma observação neste período"
 ],
 [
  "noReading",
  "No reading",
  "Aucune mesure",
  "Kein Messwert",
  "Nenhuma leitura"
 ],
 [
  "noCharts",
  "No visible charts",
  "Aucun graphique visible",
  "Keine sichtbaren Diagramme",
  "Nenhum gráfico visível"
 ],
 [
  "cycleFormat",
  "Nourishing cycle-data JSON, version 1.",
  "JSON de données de cycle Nourishing, version 1.",
  "Nourishing-Zyklusdaten im JSON-Format, Version 1.",
  "JSON de dados de ciclo Nourishing, versão 1."
 ],
 [
  "nutrientReferences",
  "Nutrient References",
  "Références nutritionnelles",
  "Nährstoffreferenzen",
  "Referências de nutrientes"
 ],
 [
  "originalEstimate",
  "Original estimate",
  "Estimation initiale",
  "Ursprüngliche Schätzung",
  "Estimativa original"
 ],
 [
  "partialData",
  "Partial data",
  "Données partielles",
  "Teilweise Daten",
  "Dados parciais"
 ],
 [
  "photoUnavailable",
  "Photo unavailable",
  "Photo indisponible",
  "Foto nicht verfügbar",
  "Foto indisponível"
 ],
 [
  "preparingCsv",
  "Preparing CSV…",
  "Préparation du CSV…",
  "CSV wird vorbereitet…",
  "Preparando CSV…"
 ],
 [
  "preparing",
  "Preparing…",
  "Préparation…",
  "Wird vorbereitet…",
  "Preparando…"
 ],
 [
  "printReport",
  "Print Report",
  "Imprimer le rapport",
  "Bericht drucken",
  "Imprimir relatório"
 ],
 [
  "profileBody",
  "Profile & Body",
  "Profil et corps",
  "Profil und Körper",
  "Perfil e corpo"
 ],
 [
  "profileOptions",
  "Profile options",
  "Options du profil",
  "Profiloptionen",
  "Opções do perfil"
 ],
 [
  "proteinGrams",
  "Protein (g)",
  "Protéines (g)",
  "Protein (g)",
  "Proteínas (g)"
 ],
 [
  "recordedMeasurements",
  "Recorded Measurements",
  "Mesures enregistrées",
  "Gespeicherte Messwerte",
  "Medições registradas"
 ],
 [
  "refreshSnapshots",
  "Refresh snapshots",
  "Actualiser les photos",
  "Fotos aktualisieren",
  "Atualizar fotos"
 ],
 [
  "reloadChart",
  "Reload chart",
  "Recharger le graphique",
  "Diagramm neu laden",
  "Recarregar gráfico"
 ],
 [
  "reloadLatestChart",
  "Reload latest chart",
  "Recharger le dernier graphique",
  "Aktuelles Diagramm laden",
  "Recarregar gráfico atual"
 ],
 [
  "reloadRecord",
  "Reload record",
  "Recharger l’entrée",
  "Eintrag neu laden",
  "Recarregar registro"
 ],
 [
  "reloadSettings",
  "Reload settings",
  "Recharger les paramètres",
  "Einstellungen neu laden",
  "Recarregar configurações"
 ],
 [
  "reloadTargets",
  "Reload targets",
  "Recharger les objectifs",
  "Ziele neu laden",
  "Recarregar metas"
 ],
 [
  "removeObservations",
  "Remove Observations",
  "Supprimer les observations",
  "Beobachtungen entfernen",
  "Remover observações"
 ],
 [
  "removeSelected",
  "Remove selected",
  "Supprimer la sélection",
  "Auswahl entfernen",
  "Remover selecionados"
 ],
 [
  "replaceTargets",
  "Replaces default energy and macro targets. Scheduled days stay unchanged.",
  "Remplace les objectifs d’énergie et de macronutriments par défaut. Les jours planifiés restent inchangés.",
  "Ersetzt die Standardziele für Energie und Makronährstoffe. Geplante Tage bleiben unverändert.",
  "Substitui as metas padrão de energia e macronutrientes. Os dias programados não mudam."
 ],
 [
  "restingKcal",
  "Resting energy (kcal)",
  "Énergie au repos (kcal)",
  "Ruheenergie (kcal)",
  "Energia em repouso (kcal)"
 ],
 [
  "reviewImport",
  "Review Import",
  "Vérifier l’importation",
  "Import prüfen",
  "Revisar importação"
 ],
 [
  "saveUnknown",
  "Save not confirmed. Retry to check.",
  "Enregistrement non confirmé. Réessayez pour vérifier.",
  "Speicherung nicht bestätigt. Zur Prüfung erneut versuchen.",
  "Salvamento não confirmado. Tente novamente para verificar."
 ],
 [
  "sex",
  "Sex",
  "Sexe",
  "Geschlecht",
  "Sexo"
 ],
 [
  "showDiary",
  "Show in diary",
  "Afficher dans le journal",
  "Im Tagebuch anzeigen",
  "Mostrar no diário"
 ],
 [
  "targetRange",
  "Target Range",
  "Plage cible",
  "Zielbereich",
  "Faixa da meta"
 ],
 [
  "targetMax",
  "Target maximum",
  "Objectif maximum",
  "Zielobergrenze",
  "Meta máxima"
 ],
 [
  "targetMin",
  "Target minimum",
  "Objectif minimum",
  "Zieluntergrenze",
  "Meta mínima"
 ],
 [
  "targetsChanged",
  "Targets changed. Reload to continue.",
  "Les objectifs ont changé. Rechargez pour continuer.",
  "Die Ziele haben sich geändert. Zum Fortfahren neu laden.",
  "As metas mudaram. Recarregue para continuar."
 ],
 [
  "cycleMismatch",
  "The cycle dates do not match this chart.",
  "Les dates du cycle ne correspondent pas au graphique.",
  "Die Zyklusdaten passen nicht zu diesem Diagramm.",
  "As datas do ciclo não correspondem a este gráfico."
 ],
 [
  "reportChanged",
  "The report changed. Reload nutrient details.",
  "Le rapport a changé. Rechargez les détails du nutriment.",
  "Der Bericht hat sich geändert. Nährstoffdetails neu laden.",
  "O relatório mudou. Recarregue os detalhes do nutriente."
 ],
 [
  "chartUnavailable",
  "This chart is no longer available.",
  "Ce graphique n’est plus disponible.",
  "Dieses Diagramm ist nicht mehr verfügbar.",
  "Este gráfico não está mais disponível."
 ],
 [
  "measurementUnavailable",
  "This measurement is no longer available.",
  "Cette mesure n’est plus disponible.",
  "Diese Messung ist nicht mehr verfügbar.",
  "Esta medição não está mais disponível."
 ],
 [
  "reportClosed",
  "This report is no longer open.",
  "Ce rapport n’est plus ouvert.",
  "Dieser Bericht ist nicht mehr geöffnet.",
  "Este relatório não está mais aberto."
 ],
 [
  "saveConfirm",
  "Unable to confirm the save. Try again.",
  "Impossible de confirmer l’enregistrement. Réessayez.",
  "Speicherung konnte nicht bestätigt werden. Erneut versuchen.",
  "Não foi possível confirmar o salvamento. Tente novamente."
 ],
 [
  "limitsLoad",
  "Unable to load limits. Reload to continue.",
  "Impossible de charger les limites. Rechargez pour continuer.",
  "Grenzwerte konnten nicht geladen werden. Zum Fortfahren neu laden.",
  "Não foi possível carregar os limites. Recarregue para continuar."
 ],
 [
  "targetsLoad",
  "Unable to load targets.",
  "Impossible de charger les objectifs.",
  "Ziele konnten nicht geladen werden.",
  "Não foi possível carregar as metas."
 ],
 [
  "defaultTargets",
  "Use default targets",
  "Utiliser les objectifs par défaut",
  "Standardziele verwenden",
  "Usar metas padrão"
 ],
 [
  "heightResting",
  "Use height for resting energy",
  "Utiliser la taille pour l’énergie au repos",
  "Größe für Ruheenergie verwenden",
  "Usar altura para energia em repouso"
 ],
 [
  "useReferences",
  "Use nutrient references",
  "Utiliser les références nutritionnelles",
  "Nährstoffreferenzen verwenden",
  "Usar referências de nutrientes"
 ],
 [
  "useMeasurements",
  "Use recorded measurements",
  "Utiliser les mesures enregistrées",
  "Gespeicherte Messwerte verwenden",
  "Usar medições registradas"
 ],
 [
  "ketoMeasurements",
  "Use weight & body fat for Keto",
  "Utiliser le poids et la masse grasse pour Keto",
  "Gewicht und Körperfett für Keto verwenden",
  "Usar peso e gordura corporal para Keto"
 ],
 [
  "weightResting",
  "Use weight for resting energy",
  "Utiliser le poids pour l’énergie au repos",
  "Gewicht für Ruheenergie verwenden",
  "Usar peso para energia em repouso"
 ],
 [
  "twoAxes",
  "View two different data series on your Y-Axis - one on the left and one on the right.",
  "Affichez deux séries de données : une sur l’axe gauche et une sur l’axe droit.",
  "Zeigen Sie zwei Datenreihen an: eine auf der linken und eine auf der rechten Y-Achse.",
  "Veja duas séries de dados: uma no eixo esquerdo e outra no direito."
 ],
 [
  "weekday",
  "Weekday",
  "Jour de la semaine",
  "Wochentag",
  "Dia da semana"
 ],
 [
  "weekdayOverrides",
  "Weekday overrides",
  "Objectifs par jour de la semaine",
  "Ziele nach Wochentag",
  "Metas por dia da semana"
 ],
 [
  "pauseEnable",
  "Enable The Pause Life Settings",
  "Activer les paramètres The Pause Life",
  "The-Pause-Life-Einstellungen aktivieren",
  "Ativar configurações The Pause Life"
 ],
 [
  "program",
  "Program",
  "Programme",
  "Programm",
  "Programa"
 ],
 [
  "enablePause",
  "The Pause Life Settings",
  "Paramètres The Pause Life",
  "The-Pause-Life-Einstellungen",
  "Configurações The Pause Life"
 ],
["expenditureLoad", "Unable to load expenditure. Try again.", "Impossible de charger la dépense. Réessayez.", "Verbrauch konnte nicht geladen werden. Erneut versuchen.", "Não foi possível carregar o gasto. Tente novamente."],
["recordedExercise", "Choose recorded exercise in energy settings.", "Choisissez les exercices enregistrés dans les paramètres énergétiques.", "Erfasste Bewegung in den Energieeinstellungen auswählen.", "Selecione exercícios registrados nas configurações de energia."],
["macroLoad", "Unable to load macro targets. Try again.", "Impossible de charger les objectifs de macros. Réessayez.", "Makroziele konnten nicht geladen werden. Erneut versuchen.", "Não foi possível carregar as metas de macros. Tente novamente."],
["weightGoalLoad", "Unable to load weight goal. Try again.", "Impossible de charger l’objectif de poids. Réessayez.", "Gewichtsziel konnte nicht geladen werden. Erneut versuchen.", "Não foi possível carregar a meta de peso. Tente novamente."],
["scheduleLoad", "Unable to load the macro schedule. Try again.", "Impossible de charger le planning des macros. Réessayez.", "Makroplan konnte nicht geladen werden. Erneut versuchen.", "Não foi possível carregar a programação de macros. Tente novamente."],
["targetChange", "Choose a supported target change.", "Choisissez une modification d’objectif prise en charge.", "Unterstützte Zieländerung auswählen.", "Selecione uma alteração de meta compatível."],
["recordedFacts", "Recorded diary facts", "Données du journal", "Erfasste Tagebuchdaten", "Dados registrados no diário"],
["goalsPreferences", "Goals & preferences", "Objectifs et préférences", "Ziele und Präferenzen", "Metas e preferências"],
["preferencesTargets", "Preferences do not change your targets.", "Les préférences ne modifient pas vos objectifs.", "Präferenzen ändern Ihre Ziele nicht.", "As preferências não alteram suas metas."],
["showRecords", "Show records", "Afficher les données", "Einträge anzeigen", "Mostrar registros"],
["fullReport", "View full report", "Voir le rapport complet", "Vollständigen Bericht anzeigen", "Ver relatório completo"],
["dailySummary", "Daily summary", "Résumé quotidien", "Tagesübersicht", "Resumo diário"],
["energyBalance", "Energy balance", "Bilan énergétique", "Energiebilanz", "Balanço energético"],
["estimatedExpenditure", "Estimated expenditure", "Dépense estimée", "Geschätzter Verbrauch", "Gasto estimado"],
["intakeTarget", "Intake target", "Objectif d’apport", "Aufnahmeziel", "Meta de ingestão"],
["balance", "Balance", "Bilan", "Bilanz", "Balanço"],
["drinkingWater", "Drinking water", "Eau de boisson", "Trinkwasser", "Água potável"],
["detailsLimits", "Details & limits", "Détails et limites", "Details und Grenzen", "Detalhes e limites"],
["otherNotes", "Other notes", "Autres notes", "Weitere Notizen", "Outras notas"],
["overview", "Overview", "Vue d’ensemble", "Übersicht", "Visão geral"],
["partialFoods", "{{known}}/{{total}} foods measured", "{{known}}/{{total}} aliments mesurés", "{{known}}/{{total}} Lebensmittel erfasst", "{{known}}/{{total}} alimentos medidos"],
["targetAmount", "Target {{amount}}", "Objectif {{amount}}", "Ziel {{amount}}", "Meta {{amount}}"],
["pastFast", "Log Past Fast", "Enregistrer un jeûne passé", "Vergangenes Fasten eintragen", "Registrar jejum passado"],
["editFast", "Edit Fast", "Modifier le jeûne", "Fasten bearbeiten", "Editar jejum"],
["endFastQuestion", "End Fast?", "Terminer le jeûne ?", "Fasten beenden?", "Encerrar jejum?"],
["endFastConfirm", "End your current fast?", "Terminer votre jeûne en cours ?", "Aktuelles Fasten beenden?", "Encerrar seu jejum atual?"],
["startFastQuestion", "Start Fast Now?", "Commencer le jeûne maintenant ?", "Fasten jetzt starten?", "Iniciar jejum agora?"],
["startFastConfirm", "Start {{name}} now?", "Commencer {{name}} maintenant ?", "{{name}} jetzt starten?", "Iniciar {{name}} agora?"],
["fastRefresh", "Unable to refresh fasting. Try again.", "Impossible d’actualiser les jeûnes. Réessayez.", "Fasten konnte nicht aktualisiert werden. Erneut versuchen.", "Não foi possível atualizar os jejuns. Tente novamente."],
["fastSelection", "Select 1 to 100 fasts.", "Sélectionnez de 1 à 100 jeûnes.", "1 bis 100 Fastenzeiten auswählen.", "Selecione de 1 a 100 jejuns."],
["fastSelectionLimit", "Select up to 100 fasts.", "Sélectionnez jusqu’à 100 jeûnes.", "Bis zu 100 Fastenzeiten auswählen.", "Selecione até 100 jejuns."],
["fastSetup", "Scheduled starts pending setup", "Départs planifiés en attente de configuration", "Geplante Starts warten auf Einrichtung", "Inícios programados aguardando configuração"],
["durationInvalid", "Choose a valid duration.", "Choisissez une durée valide.", "Gültige Dauer auswählen.", "Selecione uma duração válida."],
["lastUpdated", "Last updated {{date}}", "Dernière mise à jour : {{date}}", "Zuletzt aktualisiert: {{date}}", "Última atualização: {{date}}"],
["restingInputs", "Used for your resting energy estimate.", "Utilisé pour estimer votre dépense au repos.", "Für die Schätzung Ihres Ruheenergiebedarfs.", "Usado para estimar sua energia em repouso."],
["nutrientInputs", "Used for your nutrient references.", "Utilisé pour vos références nutritionnelles.", "Für Ihre Nährstoffreferenzwerte.", "Usado para suas referências nutricionais."],
["equationBirthDate", "Mifflin-St Jeor · birth date", "Mifflin-St Jeor · date de naissance", "Mifflin-St Jeor · Geburtsdatum", "Mifflin-St Jeor · data de nascimento"],
["equationAge", "Mifflin-St Jeor · age", "Mifflin-St Jeor · âge", "Mifflin-St Jeor · Alter", "Mifflin-St Jeor · idade"],
["reloadLatest", "Reload latest", "Recharger les données", "Aktuelle Daten laden", "Recarregar dados atuais"],
["snapshotOptions", "Snapshot options", "Options de la photo", "Fotooptionen", "Opções da foto"],
["snapshotView", "View snapshot", "Voir la photo", "Foto ansehen", "Ver foto"],
["noActiveFast", "No Fast in Progress", "Aucun jeûne en cours", "Kein Fasten aktiv", "Nenhum jejum em andamento"],
["nextFast", "Next: {{name}}", "Prochain : {{name}}", "Als Nächstes: {{name}}", "Próximo: {{name}}"],
["showGlucose", "Show Glucose", "Afficher la glycémie", "Glukose anzeigen", "Mostrar glicose"],
["showCycleTracking", "Show Cycle Tracking", "Afficher le suivi du cycle", "Zyklusverfolgung anzeigen", "Mostrar acompanhamento do ciclo"],
["coachUnavailable", "Show Coach (unavailable)", "Afficher le coach (indisponible)", "Coach anzeigen (nicht verfügbar)", "Mostrar coach (indisponível)"],
["viewDetails", "VIEW DETAILS", "VOIR LES DÉTAILS", "DETAILS ANZEIGEN", "VER DETALHES"],
["sharedTimestamp", "Shared timestamp", "Horodatage partagé", "Gemeinsamer Zeitstempel", "Horário compartilhado"],
["timeMissing", "Time not recorded", "Heure non enregistrée", "Uhrzeit nicht erfasst", "Horário não registrado"],
["latest", "Latest", "Dernière mesure", "Neuester Wert", "Mais recente"],
["average", "Average", "Moyenne", "Durchschnitt", "Média"],
["recordedReadings", "Recorded readings", "Mesures enregistrées", "Erfasste Messwerte", "Medições registradas"],
["recordedSamples", "{{count}} recorded samples", "{{count}} mesures enregistrées", "{{count}} erfasste Messwerte", "{{count}} amostras registradas"],
["glucosePlot", "Glucose: {{count}} recorded samples; {{from}} to {{to}}", "Glycémie : {{count}} mesures enregistrées ; du {{from}} au {{to}}", "Glukose: {{count}} erfasste Messwerte; {{from}} bis {{to}}", "Glicose: {{count}} amostras registradas; {{from}} a {{to}}"],
["copiedExcluded", "Copy · excluded from summary", "Copie · exclue du résumé", "Kopie · von der Übersicht ausgeschlossen", "Cópia · excluída do resumo"],
["glucosePages", "Glucose reading pages", "Pages des mesures de glycémie", "Seiten mit Glukosemesswerten", "Páginas de medições de glicose"],
["readingPage", "{{from}}–{{to}} of {{total}}", "{{from}}–{{to}} sur {{total}}", "{{from}}–{{to}} von {{total}}", "{{from}}–{{to}} de {{total}}"],
["invalidGlucose", "{{count}} invalid glucose readings excluded", "{{count}} mesures de glycémie non valides exclues", "{{count}} ungültige Glukosemesswerte ausgeschlossen", "{{count}} medições de glicose inválidas excluídas"],
["coachAbout", "Review recorded diary facts and save your goals and preferences.", "Consultez les données du journal et enregistrez vos objectifs et préférences.", "Erfasste Tagebuchdaten ansehen und Ziele und Präferenzen speichern.", "Consulte os dados registrados no diário e salve suas metas e preferências."],
["noGlucoseSource", "No glucose source selected", "Aucune source de glycémie sélectionnée", "Keine Glukosequelle ausgewählt", "Nenhuma fonte de glicose selecionada"],
["noGlucoseReadings", "No glucose readings", "Aucune mesure de glycémie", "Keine Glukosemesswerte", "Nenhuma medição de glicose"],
["selectObservation", "Select {{label}}", "Sélectionner {{label}}", "{{label}} auswählen", "Selecionar {{label}}"],
["cycleReviewCounts", "{{added}} new · {{updated}} updated · {{unchanged}} unchanged · {{older}} older skipped", "{{added}} nouvelles · {{updated}} mises à jour · {{unchanged}} inchangées · {{older}} anciennes ignorées", "{{added}} neu · {{updated}} aktualisiert · {{unchanged}} unverändert · {{older}} ältere übersprungen", "{{added}} novas · {{updated}} atualizadas · {{unchanged}} inalteradas · {{older}} antigas ignoradas"],
["cycleRemoveConfirm", "Remove {{count}} observations?", "Supprimer {{count}} observations ?", "{{count}} Beobachtungen entfernen?", "Remover {{count}} observações?"],
["moreObservations", "{{count}} more observations", "{{count}} observations supplémentaires", "{{count}} weitere Beobachtungen", "Mais {{count}} observações"],
["chartNoData", "No data available", "Aucune donnée disponible", "Keine Daten verfügbar", "Nenhum dado disponível"],
["cycleReload", "Refresh the chart to load its cycle data.", "Actualisez le graphique pour charger les données du cycle.", "Diagramm aktualisieren, um die Zyklusdaten zu laden.", "Atualize o gráfico para carregar os dados do ciclo."],
["suggestFood", "Suggest food", "Suggérer des aliments", "Lebensmittel vorschlagen", "Sugerir alimentos"]
];
export const discoverMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,i)=>[language,Object.fromEntries(rows.map(([key,...values])=>[key,values[i]]))]));
export const dc=createUITranslator(discoverMessages);

export const chartText=createUITranslator(mobileChartsMessages);
export const snapshotText=createUITranslator(snapshotMessages);
export const customChartText=createUITranslator(mobileChartEditorMessages);
