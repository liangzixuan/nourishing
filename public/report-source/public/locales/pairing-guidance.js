import {pairingGuidance} from './../../server/pairing-guidance.mjs';
const fr={
 'pressure.rule.native':'Les composantes de pression natives de Health Connect sont associées uniquement si elles proviennent de la même mesure source et de la même révision. Les paires natives incomplètes restent sans correspondance.',
 'pressure.rule.date':'Les mesures sont associées uniquement à la même date du journal. Chaque mesure enregistrée est utilisée une seule fois.',
 'pressure.rule.time':'Les autres mesures systoliques horodatées utilisent la mesure diastolique horodatée inutilisée la plus proche, dans une fenêtre de 10 minutes. À distance égale, la première dans le journal est retenue.',
 'pressure.rule.order':'Les mesures de pression restantes suivent l’ordre du journal uniquement si au moins une mesure n’a pas d’heure. Deux mesures horodatées séparées de plus de 10 minutes restent sans correspondance.',
 'pressure.rule.pulseTime':'Le pouls utilise l’heure systolique, ou l’heure diastolique si l’heure systolique est absente. Le pouls horodaté suit la même fenêtre de 10 minutes et la même règle de priorité selon l’ordre du journal.',
 'pressure.rule.pulseOrder':'Les mesures de pouls restantes suivent l’ordre du journal uniquement si la paire de pression ou le pouls n’a pas d’heure. Une mesure de pouls seule ne peut pas former une paire de pression.',
 'pressure.rule.visible':'Toutes les sessions et les mesures sans correspondance restent visibles. Les valeurs ne sont ni moyennées ni classées médicalement.',
 'glucose.rule.sources':'Seuls les types de source explicitement sélectionnés participent. Les cétones désignent le bêta-hydroxybutyrate sanguin ; les unités mmol/L et mg/dL sont acceptées.',
 'glucose.rule.date':'Les mesures sont associées uniquement à la même date du journal. Chaque mesure admissible est utilisée une seule fois.',
 'glucose.rule.time':'Les mesures de glucose horodatées, dans l’ordre enregistré du journal, utilisent la mesure de cétones horodatée inutilisée la plus proche, dans une fenêtre de 10 minutes. À distance égale, la première dans le journal est retenue.',
 'glucose.rule.order':'Les mesures restantes sont associées dans l’ordre du journal uniquement si au moins une mesure n’a pas d’heure. Deux mesures horodatées hors de cette fenêtre restent sans correspondance.',
 'glucose.rule.invalid':'Les mesures sélectionnées non valides restent listées comme exclusions et ne participent pas à l’association. Une heure absente signifie une mesure sans heure ; une heure mal formée entraîne une exclusion.',
 'glucose.rule.ratio':'Le GKI divise le glucose non arrondi en mmol/L par le bêta-hydroxybutyrate sanguin non arrondi en mmol/L. Si les cétones sont à zéro, le rapport est indisponible.',
 'glucose.rule.series':'Les séries sources conservent toutes les mesures admissibles, y compris celles sans correspondance. L’association est déterministe et gloutonne ; elle ne minimise pas la distance totale de toutes les paires.',
 'glucose.rule.policy':'Ces règles d’égalité, de réutilisation et de mélange de mesures avec ou sans heure constituent une politique locale. Les valeurs ne sont ni moyennées ni classées médicalement.',
 'pressure.reason.native':'Aucune composante native correspondante unique avec la même mesure source et la même révision.',
 'pressure.reason.unmatched':'Aucune correspondance selon ces règles d’association.'
};
const de={
 'pressure.rule.native':'Native Blutdruckkomponenten aus Health Connect werden nur derselben Quellmessung und Revision zugeordnet. Unvollständige native Paare bleiben ohne Zuordnung.',
 'pressure.rule.date':'Messwerte werden nur innerhalb desselben Tagebuchdatums zugeordnet. Jeder gespeicherte Messwert wird einmal verwendet.',
 'pressure.rule.time':'Andere systolische Messwerte mit Uhrzeit verwenden den nächsten noch unbenutzten diastolischen Messwert mit Uhrzeit innerhalb von 10 Minuten. Bei gleichem Abstand gilt die frühere Tagebuchreihenfolge.',
 'pressure.rule.order':'Übrige Blutdruckmesswerte folgen der Tagebuchreihenfolge nur, wenn mindestens einem Messwert die Uhrzeit fehlt. Zwei Messwerte mit mehr als 10 Minuten Abstand bleiben ohne Zuordnung.',
 'pressure.rule.pulseTime':'Der Puls verwendet die systolische Uhrzeit oder, falls diese fehlt, die diastolische Uhrzeit. Für Pulswerte mit Uhrzeit gelten dasselbe Zeitfenster von 10 Minuten und dieselbe Tagebuchreihenfolge bei gleichem Abstand.',
 'pressure.rule.pulseOrder':'Übrige Pulswerte folgen der Tagebuchreihenfolge nur, wenn dem Blutdruckpaar oder dem Puls die Uhrzeit fehlt. Ein Pulswert allein kann kein Blutdruckpaar bilden.',
 'pressure.rule.visible':'Alle Sitzungen und nicht zugeordneten Messwerte bleiben sichtbar. Werte werden weder gemittelt noch medizinisch klassifiziert.',
 'glucose.rule.sources':'Nur ausdrücklich ausgewählte Quelltypen werden einbezogen. Ketone bezeichnet Beta-Hydroxybutyrat im Blut; mmol/L und mg/dL werden unterstützt.',
 'glucose.rule.date':'Messwerte werden nur innerhalb desselben Tagebuchdatums zugeordnet. Jeder geeignete Messwert wird einmal verwendet.',
 'glucose.rule.time':'Glukosemesswerte mit Uhrzeit verwenden in gespeicherter Tagebuchreihenfolge den nächsten noch unbenutzten Ketonmesswert mit Uhrzeit innerhalb von 10 Minuten. Bei gleichem Abstand gilt die frühere Tagebuchreihenfolge.',
 'glucose.rule.order':'Übrige Messwerte werden nur dann in Tagebuchreihenfolge gepaart, wenn mindestens einem Messwert die Uhrzeit fehlt. Zwei Messwerte mit Uhrzeit außerhalb des Fensters bleiben ohne Zuordnung.',
 'glucose.rule.invalid':'Ungültige ausgewählte Messwerte bleiben als Ausschlüsse aufgeführt und werden nicht zugeordnet. Eine fehlende Uhrzeit gilt als ohne Uhrzeit; eine fehlerhafte Uhrzeit führt zum Ausschluss.',
 'glucose.rule.ratio':'Der GKI teilt die ungerundete Glukose in mmol/L durch das ungerundete Beta-Hydroxybutyrat im Blut in mmol/L. Bei einem Ketonwert von null ist das Verhältnis nicht verfügbar.',
 'glucose.rule.series':'Die Quellreihen behalten alle geeigneten Messwerte, auch nicht zugeordnete. Die Zuordnung ist deterministisch und schrittweise gierig; sie minimiert nicht den Gesamtabstand aller Paare.',
 'glucose.rule.policy':'Diese Regeln für gleiche Abstände, Wiederverwendung und gemischte Messwerte mit und ohne Uhrzeit sind eine lokale Regelung. Werte werden weder gemittelt noch medizinisch klassifiziert.',
 'pressure.reason.native':'Keine eindeutige passende native Komponente mit derselben Quellmessung und Revision.',
 'pressure.reason.unmatched':'Keine Zuordnung nach diesen Paarungsregeln.'
};
const pt={
 'pressure.rule.native':'Os componentes nativos de pressão do Health Connect são pareados apenas com a mesma medição de origem e revisão. Pares nativos incompletos permanecem sem correspondência.',
 'pressure.rule.date':'As medições são pareadas apenas na mesma data do diário. Cada medição registrada é usada uma vez.',
 'pressure.rule.time':'As outras medições sistólicas com horário usam a medição diastólica com horário mais próxima ainda não utilizada, dentro de 10 minutos. Em distâncias iguais, prevalece a ordem anterior no diário.',
 'pressure.rule.order':'As medições de pressão restantes seguem a ordem do diário apenas quando pelo menos uma não tem horário. Duas medições com horário separadas por mais de 10 minutos permanecem sem correspondência.',
 'pressure.rule.pulseTime':'O pulso usa o horário sistólico ou, se ausente, o horário diastólico. O pareamento do pulso com horário usa a mesma janela de 10 minutos e a mesma regra de desempate pela ordem do diário.',
 'pressure.rule.pulseOrder':'As medições de pulso restantes seguem a ordem do diário apenas quando o par de pressão ou o pulso não tem horário. Uma medição de pulso sozinha não pode formar um par de pressão.',
 'pressure.rule.visible':'Todas as sessões e medições sem correspondência permanecem visíveis. Os valores não são transformados em médias nem classificados clinicamente.',
 'glucose.rule.sources':'Somente os tipos de origem explicitamente selecionados participam. Cetonas significa beta-hidroxibutirato sanguíneo; mmol/L e mg/dL são aceitos.',
 'glucose.rule.date':'As medições são pareadas apenas na mesma data do diário. Cada medição elegível é usada uma vez.',
 'glucose.rule.time':'As medições de glicose com horário, na ordem salva no diário, usam a medição de cetonas com horário mais próxima ainda não utilizada, dentro de 10 minutos. Em distâncias iguais, prevalece a ordem anterior no diário.',
 'glucose.rule.order':'As medições restantes são pareadas na ordem do diário apenas quando pelo menos uma não tem horário. Duas medições com horário fora da janela permanecem sem correspondência.',
 'glucose.rule.invalid':'As medições selecionadas inválidas permanecem listadas como exclusões e não participam do pareamento. Horário ausente indica medição sem horário; horário malformado causa exclusão.',
 'glucose.rule.ratio':'O GKI divide a glicose não arredondada em mmol/L pelo beta-hidroxibutirato sanguíneo não arredondado em mmol/L. Cetonas iguais a zero deixam a razão indisponível.',
 'glucose.rule.series':'As séries de origem mantêm todas as medições elegíveis, inclusive as sem correspondência. O pareamento é determinístico e guloso; não minimiza a distância total entre todos os pares.',
 'glucose.rule.policy':'Estas regras de empate, reutilização e combinação de medições com e sem horário são uma política local. Os valores não são transformados em médias nem classificados clinicamente.',
 'pressure.reason.native':'Nenhum componente nativo correspondente único com a mesma medição de origem e revisão.',
 'pressure.reason.unmatched':'Nenhuma correspondência segundo estas regras de pareamento.'
};
export const pairingGuidanceMessages=Object.freeze(Object.fromEntries(Object.entries({en:pairingGuidance,fr,de,'pt-BR':pt}).map(([language,messages])=>[language,Object.freeze(Object.fromEntries(Object.entries(messages).map(([code,text])=>['pairingGuidance.'+code,text])))])));
