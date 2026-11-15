const rows=[
 ['date','Date','Date','Datum','Data'],['hour','Hour','Heure','Stunde','Hora'],['minute','Minute','Minute','Minute','Minuto'],['period','AM or PM','AM ou PM','AM oder PM','AM ou PM'],
 ['today','Today','Aujourd’hui','Heute','Hoje'],['close','Close','Fermer','Schließen','Fechar'],['save','Save','Enregistrer','Speichern','Salvar'],
 ['clockGap','This time is skipped by daylight saving. Choose another time.','Cette heure n’existe pas lors du passage à l’heure d’été. Choisissez une autre heure.','Diese Uhrzeit entfällt bei der Zeitumstellung. Wählen Sie eine andere Uhrzeit.','Este horário não existe na mudança para o horário de verão. Escolha outro horário.'],
 ['invalid','Choose a valid date and time.','Choisissez une date et une heure valides.','Wählen Sie ein gültiges Datum und eine gültige Uhrzeit.','Escolha uma data e hora válidas.']
];
export const dateTimePickerMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(rows.map(([key,...values])=>['dateTimePicker.'+key,values[index]])))])));
