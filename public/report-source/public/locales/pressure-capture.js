import {healthPressureContextLabels} from './../../server/health-pressure.mjs';
const en={
 incomplete:'The blood pressure capture is incomplete. Load it again.',size:'The blood pressure document exceeds 20,000,000 bytes. Narrow the date range.',
 systolic:'Systolic',diastolic:'Diastolic',pulse:'Pulse',noTime:'No time',
 readingOrder:'Readings {{first}}–{{last}}. Positions show reading order, not elapsed time. Labels use systolic date and time.',plot:'Blood pressure and pulse plot',
 plotPulse:'Systolic and diastolic pressure in mmHg on the left scale; pulse in bpm on the separate right scale. Readings {{first}} through {{last}}.',plotNoPulse:'Systolic and diastolic pressure in mmHg; no matched pulse readings. Readings {{first}} through {{last}}.',pressureAxis:'Pressure · mmHg',pulseAxis:'Pulse · bpm',
 source:'Same Health Connect measurement',time:'Nearest time · {{minutes}} min apart',order:'Diary order · time missing',unmatchedCell:'Not matched',unmatchedPulse:'not matched',
 capture:'Blood pressure and pulse capture',range:'Range: {{from}} through {{to}}. {{pairs}} pressure pairs; {{pulseMatched}} matched pulse readings; {{unmatched}} unmatched readings.',
 selected:'Selected metrics: Systolic — {{systolic}} (mmHg); diastolic — {{diastolic}} (mmHg); pulse — {{pulse}}.',notSelected:'not selected',
 unconfigured:'Select and save the systolic and diastolic metrics to show readings. Pulse is optional.',empty:'No readings for the selected metrics on the included dates.',
 pulseScale:'bpm, right scale',pressureScale:'mmHg, left scale',paired:'Paired readings',allPaired:'All paired readings',readingDate:'Reading / date',matching:'Matching',
 pressureMatch:'Pressure: {{basis}}',pulseMatch:'Pulse: {{basis}}',unmatched:'Unmatched readings',allUnmatched:'All unmatched readings',dateTime:'Date / time',roleMetric:'Role / metric',recorded:'Recorded value',reason:'Reason',rules:'Pairing rules'
};
const fr={
 incomplete:'Les données de pression artérielle sont incomplètes. Chargez-les à nouveau.',size:'Le document de pression artérielle dépasse 20,000,000 octets. Réduisez la période.',
 systolic:'Systolique',diastolic:'Diastolique',pulse:'Pouls',noTime:'Sans heure',
 readingOrder:'Mesures {{first}} à {{last}}. Les positions indiquent l’ordre des mesures, pas le temps écoulé. Les libellés utilisent la date et l’heure systoliques.',plot:'Graphique de pression artérielle et de pouls',
 plotPulse:'Pressions systolique et diastolique en mmHg sur l’échelle gauche ; pouls en bpm sur l’échelle droite séparée. Mesures {{first}} à {{last}}.',plotNoPulse:'Pressions systolique et diastolique en mmHg ; aucune mesure de pouls associée. Mesures {{first}} à {{last}}.',pressureAxis:'Pression · mmHg',pulseAxis:'Pouls · bpm',
 source:'Même mesure Health Connect',time:'Heure la plus proche · écart de {{minutes}} min',order:'Ordre du journal · heure absente',unmatchedCell:'Sans correspondance',unmatchedPulse:'sans correspondance',
 capture:'Données de pression artérielle et de pouls',range:'Période : {{from}} à {{to}}. Paires de pression : {{pairs}} ; mesures de pouls associées : {{pulseMatched}} ; mesures sans correspondance : {{unmatched}}.',
 selected:'Mesures sélectionnées : systolique — {{systolic}} (mmHg) ; diastolique — {{diastolic}} (mmHg) ; pouls — {{pulse}}.',notSelected:'non sélectionné',
 unconfigured:'Sélectionnez et enregistrez les mesures systoliques et diastoliques pour afficher les données. Le pouls est facultatif.',empty:'Aucune donnée pour les mesures sélectionnées aux dates incluses.',
 pulseScale:'bpm, échelle droite',pressureScale:'mmHg, échelle gauche',paired:'Mesures associées',allPaired:'Toutes les mesures associées',readingDate:'Mesure / date',matching:'Association',
 pressureMatch:'Pression : {{basis}}',pulseMatch:'Pouls : {{basis}}',unmatched:'Mesures sans correspondance',allUnmatched:'Toutes les mesures sans correspondance',dateTime:'Date / heure',roleMetric:'Rôle / mesure',recorded:'Valeur enregistrée',reason:'Motif',rules:'Règles d’association'
};
const de={
 incomplete:'Die Blutdruckdaten sind unvollständig. Laden Sie sie erneut.',size:'Das Blutdruckdokument überschreitet 20,000,000 Bytes. Begrenzen Sie den Zeitraum.',
 systolic:'Systolisch',diastolic:'Diastolisch',pulse:'Puls',noTime:'Ohne Uhrzeit',
 readingOrder:'Messwerte {{first}} bis {{last}}. Die Positionen zeigen die Messreihenfolge, nicht die verstrichene Zeit. Beschriftungen verwenden das systolische Datum und die Uhrzeit.',plot:'Blutdruck- und Pulsdiagramm',
 plotPulse:'Systolischer und diastolischer Druck in mmHg auf der linken Skala; Puls in bpm auf der separaten rechten Skala. Messwerte {{first}} bis {{last}}.',plotNoPulse:'Systolischer und diastolischer Druck in mmHg; keine zugeordneten Pulswerte. Messwerte {{first}} bis {{last}}.',pressureAxis:'Druck · mmHg',pulseAxis:'Puls · bpm',
 source:'Dieselbe Health Connect-Messung',time:'Nächste Uhrzeit · {{minutes}} min Abstand',order:'Tagebuchreihenfolge · Uhrzeit fehlt',unmatchedCell:'Nicht zugeordnet',unmatchedPulse:'nicht zugeordnet',
 capture:'Erfasste Blutdruck- und Pulswerte',range:'Zeitraum: {{from}} bis {{to}}. Blutdruckpaare: {{pairs}}; zugeordnete Pulswerte: {{pulseMatched}}; nicht zugeordnete Messwerte: {{unmatched}}.',
 selected:'Ausgewählte Messgrößen: systolisch — {{systolic}} (mmHg); diastolisch — {{diastolic}} (mmHg); Puls — {{pulse}}.',notSelected:'nicht ausgewählt',
 unconfigured:'Wählen und speichern Sie die systolischen und diastolischen Messgrößen, um Messwerte anzuzeigen. Der Puls ist optional.',empty:'Keine Werte für die ausgewählten Messgrößen an den eingeschlossenen Tagen.',
 pulseScale:'bpm, rechte Skala',pressureScale:'mmHg, linke Skala',paired:'Zugeordnete Messwerte',allPaired:'Alle zugeordneten Messwerte',readingDate:'Messwert / Datum',matching:'Zuordnung',
 pressureMatch:'Druck: {{basis}}',pulseMatch:'Puls: {{basis}}',unmatched:'Nicht zugeordnete Messwerte',allUnmatched:'Alle nicht zugeordneten Messwerte',dateTime:'Datum / Uhrzeit',roleMetric:'Rolle / Messgröße',recorded:'Erfasster Wert',reason:'Grund',rules:'Paarungsregeln'
};
const pt={
 incomplete:'Os dados de pressão arterial estão incompletos. Carregue-os novamente.',size:'O documento de pressão arterial excede 20,000,000 bytes. Reduza o período.',
 systolic:'Sistólica',diastolic:'Diastólica',pulse:'Pulso',noTime:'Sem horário',
 readingOrder:'Medições {{first}} a {{last}}. As posições mostram a ordem das medições, não o tempo decorrido. Os rótulos usam a data e o horário sistólicos.',plot:'Gráfico de pressão arterial e pulso',
 plotPulse:'Pressões sistólica e diastólica em mmHg na escala esquerda; pulso em bpm na escala direita separada. Medições {{first}} a {{last}}.',plotNoPulse:'Pressões sistólica e diastólica em mmHg; nenhuma medição de pulso pareada. Medições {{first}} a {{last}}.',pressureAxis:'Pressão · mmHg',pulseAxis:'Pulso · bpm',
 source:'Mesma medição do Health Connect',time:'Horário mais próximo · {{minutes}} min de diferença',order:'Ordem do diário · horário ausente',unmatchedCell:'Sem correspondência',unmatchedPulse:'sem correspondência',
 capture:'Dados de pressão arterial e pulso',range:'Período: {{from}} a {{to}}. Pares de pressão: {{pairs}}; medições de pulso pareadas: {{pulseMatched}}; medições sem correspondência: {{unmatched}}.',
 selected:'Métricas selecionadas: sistólica — {{systolic}} (mmHg); diastólica — {{diastolic}} (mmHg); pulso — {{pulse}}.',notSelected:'não selecionado',
 unconfigured:'Selecione e salve as métricas sistólica e diastólica para mostrar as medições. O pulso é opcional.',empty:'Nenhuma medição para as métricas selecionadas nas datas incluídas.',
 pulseScale:'bpm, escala direita',pressureScale:'mmHg, escala esquerda',paired:'Medições pareadas',allPaired:'Todas as medições pareadas',readingDate:'Medição / data',matching:'Pareamento',
 pressureMatch:'Pressão: {{basis}}',pulseMatch:'Pulso: {{basis}}',unmatched:'Medições sem correspondência',allUnmatched:'Todas as medições sem correspondência',dateTime:'Data / horário',roleMetric:'Função / métrica',recorded:'Valor registrado',reason:'Motivo',rules:'Regras de pareamento'
};
const context={
 en:healthPressureContextLabels,
 fr:{'position.0':'Position inconnue','position.1':'Debout','position.2':'Assis','position.3':'Allongé','position.4':'Incliné','location.0':'Site de mesure inconnu','location.1':'Poignet gauche','location.2':'Poignet droit','location.3':'Bras gauche','location.4':'Bras droit','position.unknown':'Code de position inconnu {{code}}','location.unknown':'Code de site de mesure inconnu {{code}}'},
 de:{'position.0':'Unbekannte Position','position.1':'Stehend','position.2':'Sitzend','position.3':'Liegend','position.4':'Zurückgelehnt','location.0':'Unbekannter Messort','location.1':'Linkes Handgelenk','location.2':'Rechtes Handgelenk','location.3':'Linker Oberarm','location.4':'Rechter Oberarm','position.unknown':'Unbekannter Positionscode {{code}}','location.unknown':'Unbekannter Messortcode {{code}}'},
 'pt-BR':{'position.0':'Posição desconhecida','position.1':'Em pé','position.2':'Sentado','position.3':'Deitado','position.4':'Reclinado','location.0':'Local de medição desconhecido','location.1':'Pulso esquerdo','location.2':'Pulso direito','location.3':'Braço esquerdo','location.4':'Braço direito','position.unknown':'Código de posição desconhecido {{code}}','location.unknown':'Código de local de medição desconhecido {{code}}'}
};
export const pressureCaptureMessages=Object.freeze(Object.fromEntries(Object.entries({en,fr,de,'pt-BR':pt}).map(([language,messages])=>[language,Object.freeze({...Object.fromEntries(Object.entries(messages).map(([key,text])=>['pressureCapture.'+key,text])),...Object.fromEntries(Object.entries(context[language]).map(([key,text])=>['pressureContext.'+key,text]))})])));
