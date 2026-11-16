const rows=[
 ['title','Add Biometric','Ajouter une mesure','Messwert hinzufügen','Adicionar medida'],
 ['search','Search all biometrics…','Rechercher une mesure…','Alle Messwerte durchsuchen…','Buscar medidas…'],
 ['custom','Custom Biometric','Mesure personnalisée','Eigener Messwert','Medida personalizada'],
 ['customTitle','Add Custom Biometric','Ajouter une mesure personnalisée','Eigenen Messwert hinzufügen','Adicionar medida personalizada'],
 ['name','Biometric Name','Nom de la mesure','Name des Messwerts','Nome da medida'],
 ['unit','Unit','Unité','Einheit','Unidade'],['units','Units','Unités','Einheiten','Unidades'],
 ['amount','Amount','Durée','Dauer','Duração'],['hoursMinutes','Hours : Minutes','Heures : Minutes','Stunden : Minuten','Horas : Minutos'],
 ['timestamp','Timestamp','Heure','Uhrzeit','Horário'],['group','Group','Groupe','Gruppe','Grupo'],
 ['add','Add to Diary','Ajouter au journal','Zum Tagebuch hinzufügen','Adicionar ao diário'],
 ['otherUnit','Other unit…','Autre unité…','Andere Einheit…','Outra unidade…'],
 ['retry','Retry','Réessayer','Erneut versuchen','Tentar novamente'],
 ['noResults','No measurements found.','Aucune mesure trouvée.','Keine Messwerte gefunden.','Nenhuma medida encontrada.'],
 ['check','Check save status','Vérifier l’enregistrement','Speicherstatus prüfen','Verificar salvamento'],
 ['unknown','Save status is unknown. Check before retrying.','Enregistrement incertain. Vérifiez avant de réessayer.','Speicherstatus unbekannt. Vor erneutem Speichern prüfen.','Salvamento incerto. Verifique antes de tentar de novo.']
];
export const mobileBiometricMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(rows.map(([key,...values])=>['mobileBiometric.'+key,values[index]])))])));
