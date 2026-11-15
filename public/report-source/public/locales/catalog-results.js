const rows=[
 [
  "name",
  "Food catalog",
  "Catalogue alimentaire",
  "Lebensmittelkatalog",
  "Catálogo de alimentos"
 ],
 [
  "search",
  "Search Food catalog",
  "Rechercher dans le catalogue alimentaire",
  "Lebensmittelkatalog durchsuchen",
  "Pesquisar no catálogo de alimentos"
 ],
 [
  "placeholder",
  "Search {{countText}} catalog foods…",
  "Rechercher parmi {{countText}} aliments du catalogue…",
  "{{countText}} Kataloglebensmittel durchsuchen…",
  "Pesquisar entre {{countText}} alimentos do catálogo…"
 ],
 [
  "offlineSearch",
  "Offline search",
  "Recherche hors ligne",
  "Offline-Suche",
  "Pesquisa offline"
 ],
 [
  "basisHelp",
  "Catalog records retain their published nutrient basis. Choose a food to review its source and household portions. Adding it saves an immutable source snapshot in My library.",
  "Les entrées du catalogue conservent leur base nutritionnelle publiée. Choisissez un aliment pour consulter sa source et ses portions usuelles. Son ajout enregistre une copie source non modifiable dans Ma bibliothèque.",
  "Katalogeinträge behalten ihre veröffentlichte Nährwertbasis. Wählen Sie ein Lebensmittel, um die Quelle und Haushaltsportionen zu prüfen. Beim Hinzufügen wird eine unveränderliche Quellkopie in Meine Bibliothek gespeichert.",
  "Os registros do catálogo mantêm a base nutricional publicada. Escolha um alimento para conferir sua fonte e porções caseiras. Ao adicioná-lo, uma cópia imutável da fonte é salva em Minha biblioteca."
 ],
 [
  "unavailable",
  "Food catalog is not installed",
  "Le catalogue alimentaire n’est pas installé",
  "Der Lebensmittelkatalog ist nicht installiert",
  "O catálogo de alimentos não está instalado"
 ],
 [
  "unavailableHelp",
  "Your saved foods and recipes are still available in My library. Install the offline catalog from the app folder when you are ready.",
  "Vos aliments et recettes enregistrés restent disponibles dans Ma bibliothèque. Installez le catalogue hors ligne depuis le dossier de l’application quand vous le souhaitez.",
  "Ihre gespeicherten Lebensmittel und Rezepte bleiben in Meine Bibliothek verfügbar. Installieren Sie den Offline-Katalog bei Bedarf aus dem App-Ordner.",
  "Seus alimentos e receitas salvos continuam disponíveis em Minha biblioteca. Instale o catálogo offline pela pasta do aplicativo quando quiser."
 ],
 [
  "settings",
  "Open catalog settings",
  "Ouvrir les paramètres du catalogue",
  "Katalogeinstellungen öffnen",
  "Abrir configurações do catálogo"
 ],
 [
  "pickerUnavailable",
  "Use My library for your saved foods. Catalog setup is available in Settings.",
  "Utilisez Ma bibliothèque pour vos aliments enregistrés. La configuration du catalogue est disponible dans Paramètres.",
  "Ihre gespeicherten Lebensmittel finden Sie in Meine Bibliothek. Die Katalogeinrichtung finden Sie in den Einstellungen.",
  "Use Minha biblioteca para acessar seus alimentos salvos. A configuração do catálogo está disponível em Configurações."
 ],
 [
  "loading",
  "Searching the offline Food catalog…",
  "Recherche dans le catalogue alimentaire hors ligne…",
  "Offline-Lebensmittelkatalog wird durchsucht…",
  "Pesquisando no catálogo de alimentos offline…"
 ],
 [
  "failed",
  "Catalog search failed",
  "La recherche dans le catalogue a échoué",
  "Katalogsuche fehlgeschlagen",
  "Falha na pesquisa do catálogo"
 ],
 [
  "retry",
  "Try again",
  "Réessayer",
  "Erneut versuchen",
  "Tentar novamente"
 ],
 [
  "nutrients_one",
  "{{count}} known nutrient",
  "{{count}} nutriment connu",
  "{{count}} bekannter Nährstoff",
  "{{count}} nutriente conhecido"
 ],
 [
  "nutrients_other",
  "{{count}} known nutrients",
  "{{count}} nutriments connus",
  "{{count}} bekannte Nährstoffe",
  "{{count}} nutrientes conhecidos"
 ],
 [
  "portions_one",
  "{{count}} portion",
  "{{count}} portion",
  "{{count}} Portion",
  "{{count}} porção"
 ],
 [
  "portions_other",
  "{{count}} portions",
  "{{count}} portions",
  "{{count}} Portionen",
  "{{count}} porções"
 ],
 [
  "basis",
  "per {{amount}} {{unit}}",
  "pour {{amount}} {{unit}}",
  "pro {{amount}} {{unit}}",
  "por {{amount}} {{unit}}"
 ],
 [
  "basisUnknown",
  "Nutrient basis unknown",
  "Base nutritionnelle inconnue",
  "Nährwertbasis unbekannt",
  "Base nutricional desconhecida"
 ],
 [
  "emptyTitle",
  "No catalog foods found",
  "Aucun aliment du catalogue trouvé",
  "Keine Kataloglebensmittel gefunden",
  "Nenhum alimento do catálogo encontrado"
 ],
 [
  "emptyHelp",
  "Try a shorter food name. Searches use literal words.",
  "Essayez un nom d’aliment plus court. La recherche utilise les mots saisis.",
  "Versuchen Sie einen kürzeren Lebensmittelnamen. Die Suche verwendet die eingegebenen Wörter.",
  "Tente um nome de alimento mais curto. A pesquisa usa as palavras digitadas."
 ],
 [
  "range",
  "{{start}}–{{end}} of {{total}}",
  "{{start}}–{{end}} sur {{total}}",
  "{{start}}–{{end}} von {{total}}",
  "{{start}}–{{end}} de {{total}}"
 ],
 [
  "zeroResults",
  "0 results",
  "0 résultat",
  "0 Ergebnisse",
  "0 resultados"
 ],
 [
  "previous",
  "Previous",
  "Précédent",
  "Zurück",
  "Anterior"
 ],
 [
  "next",
  "Next",
  "Suivant",
  "Weiter",
  "Próximo"
 ]
];
export const catalogResultMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.fromEntries(rows.map(([key,...values])=>['catalogResults.'+key,values[index]]))]));
