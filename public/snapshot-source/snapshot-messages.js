const rows=[
 ['add','Add Snapshot','Ajouter une photo','Foto hinzufügen','Adicionar foto'],
 ['empty','No snaps yet!','Pas encore de photos !','Noch keine Fotos!','Ainda não há fotos!'],
 ['emptyHint','Add snapshots here to view your progress over time.','Ajoutez des photos pour suivre votre progression.','Fügen Sie Fotos hinzu, um Ihren Fortschritt zu sehen.','Adicione fotos para acompanhar seu progresso.'],
 ['source','Select from:','Choisir :','Auswählen:','Selecionar:'],['camera','Camera','Appareil photo','Kamera','Câmera'],['files','Files','Fichiers','Dateien','Arquivos'],
 ['options','Photo options','Options de la photo','Fotooptionen','Opções da foto'],['view','View photo','Voir la photo','Foto ansehen','Ver foto'],['photo','Snapshot','Photo','Foto','Foto'],
 ['date','Edit Date','Modifier la date','Datum bearbeiten','Editar data'],['caption','Edit Caption','Modifier la légende','Bildtext bearbeiten','Editar legenda'],['delete','Delete','Supprimer','Löschen','Excluir'],
 ['captionTitle','Photo Caption','Légende de la photo','Bildtext','Legenda da foto'],['deleteTitle','Delete Photo','Supprimer la photo','Foto löschen','Excluir foto'],['deleteHint','Are you sure you want to delete this photo?','Voulez-vous supprimer cette photo ?','Möchten Sie dieses Foto löschen?','Deseja excluir esta foto?'],
 ['cancel','Cancel','Annuler','Abbrechen','Cancelar'],['save','Save','Enregistrer','Speichern','Salvar'],['back','Back','Retour','Zurück','Voltar'],
 ['loading','Loading…','Chargement…','Wird geladen…','Carregando…'],['saving','Saving…','Enregistrement…','Wird gespeichert…','Salvando…'],['retry','Retry','Réessayer','Erneut versuchen','Tentar novamente'],
 ['fileError','Choose a JPEG, PNG or WebP photo under 8 MB.','Choisissez une photo JPEG, PNG ou WebP de moins de 8 Mo.','Wählen Sie ein JPEG-, PNG- oder WebP-Foto unter 8 MB.','Escolha uma foto JPEG, PNG ou WebP com menos de 8 MB.'],
 ['age','Age','Âge','Alter','Idade'],['weight','Weight','Poids','Gewicht','Peso'],['bmi','BMI','IMC','BMI','IMC'],['fat','Body fat','Masse grasse','Körperfett','Gordura corporal']
];
export const snapshotMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,i)=>[language,Object.fromEntries(rows.map(row=>[row[0],row[i+1]]))]));
