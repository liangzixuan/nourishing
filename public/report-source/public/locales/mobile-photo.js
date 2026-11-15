const rows=[
 ['title','Photo Log','Journal photo','Foto-Log','Registro por foto'],
 ['hint','Take a photo of your food to find matching foods.','Photographiez votre repas pour trouver les aliments correspondants.','Fotografiere dein Essen, um passende Lebensmittel zu finden.','Fotografe sua refeição para encontrar os alimentos correspondentes.'],
 ['cancel','Cancel','Annuler','Abbrechen','Cancelar'],
 ['dismiss','Dismiss tip','Masquer le conseil','Hinweis schließen','Dispensar dica'],
 ['gallery','Choose photo','Choisir une photo','Foto auswählen','Escolher foto'],
 ['capture','Take photo','Prendre une photo','Foto aufnehmen','Tirar foto'],
 ['preview','Camera preview','Aperçu de la caméra','Kameravorschau','Prévia da câmera'],
 ['retry','Open camera','Ouvrir la caméra','Kamera öffnen','Abrir câmera'],
 ['opening','Opening camera…','Ouverture de la caméra…','Kamera wird geöffnet…','Abrindo câmera…'],
 ['paused','Camera paused.','Caméra en pause.','Kamera pausiert.','Câmera pausada.'],
 ['denied','Camera access denied. Allow access or choose a photo.','Accès à la caméra refusé. Autorisez l’accès ou choisissez une photo.','Kamerazugriff verweigert. Erlaube den Zugriff oder wähle ein Foto.','Acesso à câmera negado. Permita o acesso ou escolha uma foto.'],
 ['noCamera','No camera found. Choose a photo.','Aucune caméra détectée. Choisissez une photo.','Keine Kamera gefunden. Wähle ein Foto.','Nenhuma câmera encontrada. Escolha uma foto.'],
 ['unavailable','Camera unavailable. Try again or choose a photo.','Caméra indisponible. Réessayez ou choisissez une photo.','Kamera nicht verfügbar. Versuche es erneut oder wähle ein Foto.','Câmera indisponível. Tente novamente ou escolha uma foto.'],
 ['captureFailed','Could not take the photo. Try again.','Impossible de prendre la photo. Réessayez.','Foto konnte nicht aufgenommen werden. Versuche es erneut.','Não foi possível tirar a foto. Tente novamente.']
];
export const mobilePhotoMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(rows.map(([key,...values])=>['mobilePhoto.'+key,values[index]])))])));
