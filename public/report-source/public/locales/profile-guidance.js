import {profileGuidanceTemplates} from './../../server/profile-guidance.mjs';
const rows=[
 [
  "notice",
  "Les mesures actuelles utilisent les dernières valeurs des sources sélectionnées jusqu’à la date actuelle, indépendamment de la période ou des filtres du rapport. Les valeurs manquantes ou invalides restent inconnues. Les paramètres enregistrés ci-dessous peuvent inclure des valeurs initiales et ne remplacent pas les mesures.",
  "Aktuelle Messwerte stammen aus den jeweils letzten ausgewählten Messungen bis zum heutigen Datum, unabhängig von Zeitraum oder Filtern des Tagebuchberichts. Fehlende oder ungültige Messungen bleiben unbekannt. Die gespeicherten Einstellungen unten können Startwerte enthalten und ersetzen keine Messungen.",
  "As medições atuais usam as últimas leituras das fontes selecionadas até a data atual, independentemente do intervalo ou dos filtros do relatório. Leituras ausentes ou inválidas permanecem desconhecidas. As configurações salvas abaixo podem incluir valores iniciais e não substituem medições."
 ],
 [
  "measurement.recorded",
  "Enregistré le {{date}}{{time}} ; source sélectionnée de {{kind}}.",
  "Erfasst am {{date}}{{time}}; ausgewählte Quelle für {{kind}}.",
  "Registrado em {{date}}{{time}}; fonte selecionada de {{kind}}."
 ],
 [
  "measurement.unselected",
  "Aucune source de mesure sélectionnée. Choisissez ou vérifiez la source dans Composition corporelle enregistrée.",
  "Keine Messquelle ausgewählt. Wählen oder prüfen Sie die Quelle unter Erfasste Körperzusammensetzung.",
  "Nenhuma fonte de medição selecionada. Escolha ou revise a fonte em Composição corporal registrada."
 ],
 [
  "measurement.empty",
  "Aucune mesure jusqu’à la date actuelle. Choisissez ou vérifiez la source dans Composition corporelle enregistrée.",
  "Keine Messung bis zum aktuellen Datum. Wählen oder prüfen Sie die Quelle unter Erfasste Körperzusammensetzung.",
  "Nenhuma leitura até a data atual. Escolha ou revise a fonte em Composição corporal registrada."
 ],
 [
  "measurement.invalid",
  "La dernière mesure sélectionnée est invalide. Choisissez ou vérifiez la source dans Composition corporelle enregistrée.",
  "Die letzte ausgewählte Messung ist ungültig. Wählen oder prüfen Sie die Quelle unter Erfasste Körperzusammensetzung.",
  "A última leitura selecionada é inválida. Escolha ou revise a fonte em Composição corporal registrada."
 ],
 [
  "age.birth",
  "Années révolues calculées à partir de la date de naissance enregistrée à la date actuelle.",
  "Vollendete Lebensjahre aus dem gespeicherten Geburtsdatum am aktuellen Datum.",
  "Anos completos calculados a partir da data de nascimento salva na data atual."
 ],
 [
  "age.manual",
  "Âge saisi manuellement dans les paramètres d’énergie au repos.",
  "Manuell eingegebenes Alter aus den Ruheenergie-Einstellungen.",
  "Idade inserida manualmente nas configurações de energia em repouso."
 ],
 [
  "age.unconfigured",
  "Aucun âge vérifié configuré dans les paramètres d’énergie au repos.",
  "Kein geprüftes Alter in den Ruheenergie-Einstellungen festgelegt.",
  "Nenhuma idade revisada configurada nas opções de energia em repouso."
 ],
 [
  "sex",
  "Sexe utilisé par l’équation d’énergie au repos configurée ; il n’est pas déduit d’autres données du profil.",
  "Geschlecht für die konfigurierte Ruheenergieformel; es wird nicht aus anderen Profildaten abgeleitet.",
  "Sexo usado pela equação configurada de energia em repouso; não é inferido de outros dados do perfil."
 ],
 [
  "bmi.missing",
  "Les mesures sélectionnées de taille et de poids sont toutes deux nécessaires.",
  "Die ausgewählten Messungen für Körpergröße und Gewicht sind beide erforderlich.",
  "As leituras selecionadas de altura e peso são necessárias."
 ],
 [
  "bmi.calculated",
  "Calculé à partir du poids et de la taille sélectionnés : kg / (mètres × mètres).{{differentDates}}",
  "Aus ausgewähltem Gewicht und Körpergröße berechnet: kg / (Meter × Meter).{{differentDates}}",
  "Calculado a partir do peso e da altura selecionados: kg / (metros × metros).{{differentDates}}"
 ],
 [
  "resting.unconfigured",
  "L’énergie au repos n’est pas configurée.",
  "Die Ruheenergie ist nicht konfiguriert.",
  "A energia em repouso não está configurada."
 ],
 [
  "resting.custom",
  "Énergie au repos saisie par l’utilisateur ; ce n’est ni un métabolisme de base mesuré ni un objectif d’énergie de maintien.",
  "Vom Nutzer eingegebene Ruheenergie; kein gemessener Grundumsatz und kein Ziel für den Erhaltungsenergiebedarf.",
  "Energia em repouso inserida pelo usuário; não é uma medição do metabolismo basal nem uma meta de energia de manutenção."
 ],
 [
  "resting.equation",
  "Estimation au repos de Mifflin-St Jeor ; équation {{sex}}, âge {{age}}, {{weight}} kg ({{weightSource}}), {{height}} cm ({{heightSource}}).{{unavailable}}",
  "Ruheenergieschätzung nach Mifflin-St Jeor; Formel {{sex}}, Alter {{age}}, {{weight}} kg ({{weightSource}}), {{height}} cm ({{heightSource}}).{{unavailable}}",
  "Estimativa de repouso de Mifflin-St Jeor; equação {{sex}}, idade {{age}}, {{weight}} kg ({{weightSource}}), {{height}} cm ({{heightSource}}).{{unavailable}}"
 ],
 [
  "fragment.time",
  " à {{time}}",
  " um {{time}}",
  " às {{time}}"
 ],
 [
  "fragment.weight",
  "poids",
  "Gewicht",
  "peso"
 ],
 [
  "fragment.height",
  "taille",
  "Körpergröße",
  "altura"
 ],
 [
  "fragment.unknown",
  "inconnu",
  "unbekannt",
  "desconhecido"
 ],
 [
  "fragment.male",
  "masculine",
  "männlich",
  "masculina"
 ],
 [
  "fragment.female",
  "féminine",
  "weiblich",
  "feminina"
 ],
 [
  "fragment.saved",
  "paramètre d’équation enregistré",
  "gespeicherte Formeleingabe",
  "entrada salva da equação"
 ],
 [
  "fragment.recordedWeight",
  "poids enregistré sélectionné",
  "ausgewähltes erfasstes Gewicht",
  "peso registrado selecionado"
 ],
 [
  "fragment.recordedHeight",
  "taille enregistrée sélectionnée",
  "ausgewählte erfasste Körpergröße",
  "altura registrada selecionada"
 ],
 [
  "fragment.differentDates",
  " Les mesures ont des dates différentes.",
  " Die Messungen stammen von unterschiedlichen Tagen.",
  " As leituras têm datas diferentes."
 ],
 [
  "fragment.unavailable",
  " Les paramètres requis sont indisponibles ou hors du cadre de calcul pris en charge pour les adultes.",
  " Erforderliche Eingaben fehlen oder liegen außerhalb der unterstützten Berechnung für Erwachsene.",
  " As entradas necessárias estão indisponíveis ou fora do cálculo para adultos compatível."
 ]
];
export const profileGuidanceMessages=Object.freeze({en:Object.freeze(Object.fromEntries(Object.entries(profileGuidanceTemplates).map(([key,value])=>['profileGuidance.'+key,value]))),...Object.fromEntries(['fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(rows.map(([key,...values])=>['profileGuidance.'+key,values[index]])))]))});
