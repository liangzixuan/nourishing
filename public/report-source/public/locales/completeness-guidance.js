import {completenessGuidance} from './../../server/completeness-guidance.mjs';
const rows=[
 [
  "daily.local",
  "Il s’agit de la complétude locale des données alimentaires, pas de la confiance des données de Cronometer ni d’un score de qualité des sources. Aucun poids de source n’est appliqué.",
  "Dies ist lokale Vollständigkeit der Lebensmitteldaten, nicht Cronometers Datenkonfidenz oder ein Qualitätswert der Quellen. Quellen werden nicht gewichtet.",
  "Isto é completude local dos dados alimentares, não a confiança dos dados do Cronometer nem uma pontuação de qualidade das fontes. Nenhum peso de fonte é aplicado."
 ],
 [
  "daily.occurrences",
  "Les comptes portent sur les occurrences d’aliments ou d’ingrédients, y compris les répétitions et les quantités nulles. La portion change l’apport, pas ces comptes.",
  "Gezählt werden Lebensmittel oder Zutatenvorkommen einschließlich Wiederholungen und Nullmengen. Die Portionsgröße ändert die Aufnahme, nicht diese Anzahlen.",
  "As contagens são ocorrências de alimentos ou ingredientes, incluindo repetições e quantidades zero. O tamanho da porção altera o consumo, não essas contagens."
 ],
 [
  "daily.water",
  "Les entrées d’eau sont exclues ; l’eau déclarée dans les aliments est incluse. Les mesures manquantes sont indisponibles ; un zéro mesuré est connu.",
  "Trinkeinträge sind ausgeschlossen; in Lebensmitteln erfasstes Wasser zählt mit. Fehlende Messwerte gelten als nicht verfügbar; eine gemessene Null gilt als bekannt.",
  "Registros de água são excluídos; a água informada nos alimentos é incluída. Medições ausentes contam como indisponíveis; zero medido conta como conhecido."
 ],
 [
  "daily.membership",
  "La composition des groupes provient de chaque calcul de score et peut inclure des composantes dont les objectifs sont absents ou désactivés. Le groupe global exclut les nutriments masqués ; les autres groupes conservent leurs règles de sélection. La mise en évidence ne change pas la composition.",
  "Die Gruppenzusammensetzung stammt aus der jeweiligen Scoreberechnung und kann Komponenten mit fehlenden oder deaktivierten Zielen enthalten. Die Gesamtgruppe schließt verborgene Nährstoffe aus; andere Gruppen behalten ihre Auswahlregeln. Hervorhebungen ändern die Zusammensetzung nicht.",
  "A composição dos grupos vem do cálculo de cada pontuação e pode incluir componentes com metas ausentes ou desativadas. O grupo geral exclui nutrientes ocultos; os demais mantêm suas regras de seleção. Destaques não alteram a composição."
 ],
 [
  "daily.carbohydrate",
  "La disponibilité des glucides totaux et nets utilise des valeurs alimentaires calculées séparément et conserve leurs définitions. Sans définition des glucides nets, toutes les contributions sont indisponibles, pas mesurées à zéro. Un jour vide ou avec seulement de l’eau a une complétude inconnue.",
  "Die Verfügbarkeit von Gesamt- und Netto-Kohlenhydraten verwendet getrennt berechnete Lebensmittelwerte mit eigenen Definitionen. Ohne Netto-Definition sind alle Beiträge nicht verfügbar, nicht als null gemessen. Ein leerer Tag oder ein Tag mit nur Trinkeinträgen hat eine unbekannte Vollständigkeit.",
  "A disponibilidade de carboidratos totais e líquidos usa valores calculados separadamente e mantém suas definições. Sem definição de líquidos, todas as contribuições ficam indisponíveis, não medidas como zero. Um dia vazio ou apenas com água tem completude desconhecida."
 ],
 [
  "period.means",
  "Les moyennes donnent le même poids à chaque pourcentage quotidien défini ; elles ne regroupent pas les comptes d’aliments. Un jour à zéro pour cent est défini et inclus. Les jours sans contributions alimentaires ou composantes de groupe admissibles sont inconnus.",
  "Mittelwerte gewichten jeden definierten Tagesprozentsatz gleich; Lebensmittelanzahlen werden nicht zusammengefasst. Ein Tag mit null Prozent ist definiert und enthalten. Tage ohne Lebensmittelbeiträge oder berücksichtigte Gruppenkomponenten gelten als unbekannt.",
  "As médias dão o mesmo peso a cada porcentagem diária definida; não agrupam as contagens de alimentos. Um dia com zero por cento é definido e incluído. Dias sem contribuições alimentares ou componentes elegíveis são desconhecidos."
 ],
 [
  "period.days",
  "Les jours définis ont un dénominateur utilisable. Les jours complets ont une disponibilité de 100 % ; les jours incomplets ont un pourcentage défini inférieur à 100 %. Ces termes ne décrivent ni la clôture du journal ni la progression vers les objectifs.",
  "Definierte Tage haben einen nutzbaren Nenner. Vollständige Tage haben 100 % Verfügbarkeit; unvollständige Tage haben einen definierten Wert unter 100 %. Diese Begriffe beschreiben weder abgeschlossene Tagebucheinträge noch den Zielfortschritt.",
  "Dias definidos têm um denominador utilizável. Dias completos têm disponibilidade de 100%; dias incompletos têm uma porcentagem definida abaixo de 100%. Esses termos não descrevem a conclusão do diário nem o progresso das metas."
 ],
 [
  "period.membership",
  "La composition des groupes et du groupe global utilise les objectifs effectifs et les limites de score de chaque date. Elle peut varier ; sa composition quotidienne exacte est conservée. Les règles actuelles de l’espace de travail s’appliquent aux dates passées, pas les paramètres archivés.",
  "Gruppen und Gesamtgruppe verwenden die wirksamen Ziele und konfigurierten Scoregrenzen des jeweiligen Datums. Ihre Zusammensetzung kann variieren; die genaue tägliche Zusammensetzung bleibt erfasst. Für vergangene Daten gelten die aktuellen Arbeitsbereichsregeln, nicht archivierte Einstellungen.",
  "A composição dos grupos e do grupo geral usa as metas efetivas e os limites configurados de cada data. Ela pode variar; a composição diária exata é mantida. As regras atuais do espaço de trabalho se aplicam às datas passadas, não as configurações arquivadas."
 ],
 [
  "period.counts",
  "Les comptes décrivent les occurrences d’aliments ou d’ingrédients, y compris les répétitions et les quantités nulles. La portion change l’apport, pas les comptes. Les entrées d’eau séparées sont exclues ; l’eau des aliments compte. Un zéro mesuré est connu.",
  "Die Anzahlen beschreiben Lebensmittel oder Zutatenvorkommen einschließlich Wiederholungen und Nullmengen. Die Portion ändert die Aufnahme, nicht die Anzahlen. Getrennte Trinkeinträge sind ausgeschlossen; Wasser in Lebensmitteln zählt. Eine gemessene Null ist bekannt.",
  "As contagens descrevem ocorrências de alimentos ou ingredientes, incluindo repetições e quantidades zero. A porção altera o consumo, não as contagens. Registros separados de água são excluídos; a água nos alimentos conta. Zero medido é conhecido."
 ],
 [
  "period.identities",
  "Toutes les lignes de nutriments et de groupes sont enregistrées, quelle que soit la sélection d’affichage. Le groupe global exclut les nutriments masqués ; les autres suivent leurs propres règles. Total et net ont une disponibilité et des méthodes enregistrées indépendantes ; changer le choix suivi ne modifie pas ces lignes. Le facteur de fer végétal ne change pas la disponibilité.",
  "Alle Nährstoff- und Gruppenzeilen werden unabhängig von der Anzeigeauswahl erfasst. Die Gesamtgruppe schließt verborgene Nährstoffe aus; andere folgen eigenen Regeln. Gesamt und Netto verwenden unabhängige Verfügbarkeit und erfasste Methoden; ein Wechsel der verfolgten Auswahl ändert diese Zeilen nicht. Der Pflanzen-Eisenfaktor ändert die Verfügbarkeit nicht.",
  "Todas as linhas de nutrientes e grupos são registradas independentemente da seleção de exibição. O grupo geral exclui nutrientes ocultos; os demais seguem suas regras. Total e líquido usam disponibilidade e métodos registrados independentes; alterar a opção acompanhada não muda essas linhas. O fator de ferro vegetal não altera a disponibilidade."
 ],
 [
  "period.scope",
  "Cette méthode locale de complétude n’applique aucun poids de source. Les filtres enregistrés de dates, jours, jour courant et compléments régissent chaque ligne.",
  "Diese lokale Vollständigkeitsmethode gewichtet keine Quellen. Die erfassten Filter für Datum, Tage, heutigen Tag und Nahrungsergänzungsmittel gelten für jede Zeile.",
  "Este método local de completude não aplica pesos de fonte nem reproduz a confiança dos dados do Cronometer. Os filtros registrados de datas, dias, dia atual e suplementos regem cada linha."
 ]
];
export const completenessGuidanceMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(rows.map(([key,...values])=>['completenessGuidance.'+key,index===0?completenessGuidance[key]:values[index-1]])))])));
