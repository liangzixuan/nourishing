const rows=[
 ['title','Translated serving and portion labels','Noms traduits des portions et mesures','Übersetzte Portionsbezeichnungen','Nomes traduzidos de porções e medidas'],
 ['help','Enter your own translations. Select a language, then enable the labels you want to translate. Copy default labels fills missing translations with the current labels; it does not translate them automatically. Weights and quantities stay unchanged.','Saisissez vos traductions. Sélectionnez une langue, puis activez les noms à traduire. Copier les noms par défaut remplit les traductions manquantes avec les noms actuels, sans traduction automatique. Les poids et quantités restent inchangés.','Gib eigene Übersetzungen ein. Wähle eine Sprache und aktiviere die Bezeichnungen, die du übersetzen möchtest. Standardbezeichnungen kopieren füllt fehlende Übersetzungen mit den aktuellen Bezeichnungen aus, ohne sie automatisch zu übersetzen. Gewichte und Mengen bleiben unverändert.','Insira suas traduções. Selecione um idioma e ative os nomes que deseja traduzir. Copiar nomes padrão preenche traduções ausentes com os nomes atuais, sem traduzi-los automaticamente. Pesos e quantidades permanecem inalterados.'],
 ['language','Measure language','Langue des mesures','Sprache der Maßeinheiten','Idioma das medidas'],
 ['choose','Choose a language','Choisir une langue','Sprache wählen','Escolher um idioma'],
 ['hasLabels',' · has labels',' · noms disponibles',' · Bezeichnungen vorhanden',' · tem nomes'],
 ['copy','Copy default labels','Copier les noms par défaut','Standardbezeichnungen kopieren','Copiar nomes padrão'],
 ['remove','Remove this language','Supprimer cette langue','Diese Sprache entfernen','Remover este idioma'],
 ['translate','Translate {{label}}','Traduire {{label}}','{{label}} übersetzen','Traduzir {{label}}'],
 ['translated','Translated {{label}}','Traduction de {{label}}','Übersetzung von {{label}}','Tradução de {{label}}'],
 ['unnamed','Unnamed portion','Portion sans nom','Unbenannte Portion','Porção sem nome'],
 ['portion','portion','portion','Portion','porção'],
 ['disposed','Open the editor again before saving translations.','Rouvrez l’éditeur avant d’enregistrer les traductions.','Öffne den Editor erneut, bevor du Übersetzungen speicherst.','Abra o editor novamente antes de salvar traduções.'],
 ['invalidList','Use at most one measure translation for each supported language.','Utilisez au plus une traduction de mesure par langue prise en charge.','Verwende höchstens eine Maßübersetzung je unterstützter Sprache.','Use no máximo uma tradução de medida por idioma disponível.'],
 ['invalidRow','A measure translation needs only a locale and label.','Une traduction de mesure doit contenir uniquement la langue et le nom.','Eine Maßübersetzung darf nur Sprache und Bezeichnung enthalten.','Uma tradução de medida deve conter apenas o idioma e o nome.'],
 ['invalidLocale','Choose each supported measure language only once.','Choisissez chaque langue de mesure disponible une seule fois.','Wähle jede unterstützte Maßsprache nur einmal.','Escolha cada idioma de medida disponível apenas uma vez.'],
 ['invalidLabel','Translation names cannot be blank or exceed 500 characters.','Les noms traduits ne peuvent pas être vides ni dépasser 500 caractères.','Übersetzte Bezeichnungen dürfen nicht leer sein oder mehr als 500 Zeichen enthalten.','Os nomes traduzidos não podem ficar em branco nem exceder 500 caracteres.'],
 ['invalidResource','Measure translations require a food or recipe.','Les traductions de mesures nécessitent un aliment ou une recette.','Maßübersetzungen benötigen ein Lebensmittel oder Rezept.','As traduções de medidas exigem um alimento ou uma receita.'],
 ['invalidPortions','Translated portions must be a list.','Les portions traduites doivent former une liste.','Übersetzte Portionen müssen eine Liste sein.','As porções traduzidas devem formar uma lista.'],
 ['invalidPortion','A translated portion must be an object.','Une portion traduite doit être un objet.','Eine übersetzte Portion muss ein Objekt sein.','Uma porção traduzida deve ser um objeto.']
];
export const measureEditorMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(rows.map(([key,...values])=>['measureEditor.'+key,values[index]])))])));
