const rows=[
["manual-food-quantity", "Enter a quantity for this manually added food.", "Saisissez une quantité pour cet aliment ajouté manuellement.", "Gib eine Menge für dieses manuell hinzugefügte Lebensmittel ein.", "Insira uma quantidade para este alimento adicionado manualmente."],
 [
  "unsupported-quantity",
  "The resulting amount is not a supported positive finite quantity.",
  "La quantité obtenue n’est pas un nombre positif fini pris en charge.",
  "Die berechnete Menge ist keine unterstützte positive endliche Zahl.",
  "A quantidade resultante não é um número positivo finito aceito."
 ],
 [
  "unknown-serving-basis",
  "The selected food has no known gram basis. Use an explicit serving override or supply a food with a known gram basis.",
  "L’aliment n’a pas de base connue en grammes. Saisissez un nombre de portions ou choisissez un aliment avec une base en grammes connue.",
  "Für dieses Lebensmittel ist keine Grammbasis bekannt. Gib eine Portionszahl ein oder wähle ein Lebensmittel mit bekannter Grammbasis.",
  "O alimento não tem uma base conhecida em gramas. Informe porções ou escolha um alimento com base conhecida em gramas."
 ],
 [
  "incomplete-quantity-override",
  "Enter a positive quantity to finish the manual correction.",
  "Saisissez une quantité positive pour terminer la correction manuelle.",
  "Gib eine positive Menge ein, um die manuelle Korrektur abzuschließen.",
  "Insira uma quantidade positiva para concluir a correção manual."
 ],
 [
  "manual-measure",
  "Uses the explicit unit and recorded serving basis. Mass and volume remain independent.",
  "Utilise l’unité explicite et la base de portion enregistrée. Masse et volume restent indépendants.",
  "Verwendet die angegebene Einheit und gespeicherte Portionsbasis. Masse und Volumen bleiben unabhängig.",
  "Usa a unidade explícita e a base de porção registrada. Massa e volume permanecem independentes."
 ],
 [
  "manual-grams",
  "Uses the explicitly entered gram quantity. Source warnings remain recorded.",
  "Utilise la quantité en grammes saisie. Les avertissements de la source restent enregistrés.",
  "Verwendet die eingegebene Grammmenge. Quellenwarnungen bleiben gespeichert.",
  "Usa a quantidade informada em gramas. Os avisos da fonte permanecem registrados."
 ],
 [
  "manual-serving",
  "Uses the explicitly selected number of the food’s nutrition-basis servings. Source warnings remain recorded.",
  "Utilise le nombre choisi de portions correspondant à la base nutritionnelle de l’aliment. Les avertissements de la source restent enregistrés.",
  "Verwendet die gewählte Zahl von Portionen der Nährwertbasis. Quellenwarnungen bleiben gespeichert.",
  "Usa o número selecionado de porções da base nutricional do alimento. Os avisos da fonte permanecem registrados."
 ],
 [
  "incomplete-portion-override",
  "Select a complete source portion to finish the manual correction.",
  "Choisissez une portion complète de la source pour terminer la correction manuelle.",
  "Wähle eine vollständige Quellenportion, um die manuelle Korrektur abzuschließen.",
  "Selecione uma porção completa da fonte para concluir a correção manual."
 ],
 [
  "manual-portion",
  "Uses the explicitly selected complete source portion and quantity. Source warnings remain recorded.",
  "Utilise la portion complète de la source et la quantité choisies. Les avertissements de la source restent enregistrés.",
  "Verwendet die gewählte vollständige Quellenportion und Menge. Quellenwarnungen bleiben gespeichert.",
  "Usa a porção completa da fonte e a quantidade selecionadas. Os avisos da fonte permanecem registrados."
 ],
 [
  "group-header",
  "This line is a recipe section header.",
  "Cette ligne est un titre de section de la recette.",
  "Diese Zeile ist eine Rezeptabschnittsüberschrift.",
  "Esta linha é um título de seção da receita."
 ],
 [
  "quantity-review-required",
  "Confirm an explicit quantity for the source ingredient.",
  "Confirmez une quantité explicite pour l’ingrédient de la source.",
  "Bestätige eine ausdrückliche Menge für die Quellzutat.",
  "Confirme uma quantidade explícita para o ingrediente da fonte."
 ],
 [
  "ounce-mass",
  "Converts the explicitly stated ounce mass using its exact gram definition.",
  "Convertit la masse indiquée en onces selon sa définition exacte en grammes.",
  "Rechnet die angegebene Unzenmasse nach ihrer exakten Grammdefinition um.",
  "Converte a massa informada em onças usando sua definição exata em gramas."
 ],
 [
  "mass-unit",
  "Converts the explicitly stated mass unit to grams.",
  "Convertit l’unité de masse indiquée en grammes.",
  "Rechnet die angegebene Masseneinheit in Gramm um.",
  "Converte a unidade de massa informada em gramas."
 ],
 [
  "published-mass",
  "Uses the recipe’s published total mass instead of a generic household portion.",
  "Utilise la masse totale publiée dans la recette au lieu d’une portion ménagère générique.",
  "Verwendet die im Rezept angegebene Gesamtmasse statt einer allgemeinen Haushaltsportion.",
  "Usa a massa total publicada na receita em vez de uma porção caseira genérica."
 ],
 [
  "published-volume",
  "Uses the recipe’s published total volume with the food’s recorded volume basis.",
  "Utilise le volume total publié dans la recette avec la base de volume enregistrée de l’aliment.",
  "Verwendet das veröffentlichte Rezeptgesamtvolumen mit der gespeicherten Volumenbasis des Lebensmittels.",
  "Usa o volume total publicado na receita com a base de volume registrada do alimento."
 ],
 [
  "unsupported-published-measurement",
  "Confirm a measured mass or metric volume for this source measurement.",
  "Confirmez une masse mesurée ou un volume métrique pour cette mesure de la source.",
  "Bestätige eine gemessene Masse oder ein metrisches Volumen für diese Quellenangabe.",
  "Confirme uma massa medida ou um volume métrico para esta medida da fonte."
 ],
 [
  "volume-unit",
  "Converts the stated metric volume using the recorded serving volume.",
  "Convertit le volume métrique indiqué avec le volume de portion enregistré.",
  "Rechnet das angegebene metrische Volumen mit dem gespeicherten Portionsvolumen um.",
  "Converte o volume métrico informado usando o volume de porção registrado."
 ],
 [
  "no-compatible-source-portion",
  "No source portion establishes this unit, form and item size. Enter grams or select a complete source portion.",
  "Aucune portion de la source ne définit cette unité, cette forme et cette taille. Saisissez des grammes ou choisissez une portion complète de la source.",
  "Keine Quellenportion belegt diese Einheit, Form und Stückgröße. Gib Gramm ein oder wähle eine vollständige Quellenportion.",
  "Nenhuma porção da fonte define esta unidade, forma e tamanho. Insira gramas ou selecione uma porção completa da fonte."
 ],
 [
  "ambiguous-source-portions",
  "Several source portions give different weights. Select the intended complete source portion or enter grams.",
  "Plusieurs portions de la source donnent des poids différents. Choisissez la portion complète voulue ou saisissez des grammes.",
  "Mehrere Quellenportionen ergeben unterschiedliche Gewichte. Wähle die gewünschte vollständige Portion oder gib Gramm ein.",
  "Várias porções da fonte resultam em pesos diferentes. Selecione a porção completa desejada ou insira gramas."
 ],
 [
  "whole-item",
  "Scales this food’s published whole-item portion by the named count. Review the food and actual item size.",
  "Ajuste la portion entière publiée de cet aliment selon le nombre indiqué. Vérifiez l’aliment et sa taille réelle.",
  "Skaliert die veröffentlichte Ganzstückportion nach der angegebenen Anzahl. Prüfe Lebensmittel und tatsächliche Stückgröße.",
  "Ajusta a porção inteira publicada deste alimento pela contagem indicada. Revise o alimento e o tamanho real."
 ],
 [
  "count-preserved",
  "Scales the published item portion by the named count. Reshaping keeps that count; food and preparation still require review.",
  "Ajuste la portion publiée selon le nombre indiqué. La découpe conserve ce nombre ; l’aliment et sa préparation restent à vérifier.",
  "Skaliert die veröffentlichte Stückportion nach der Anzahl. Formänderungen erhalten die Anzahl; Lebensmittel und Zubereitung müssen geprüft werden.",
  "Ajusta a porção publicada pela contagem indicada. Mudar a forma mantém essa contagem; o alimento e o preparo ainda precisam de revisão."
 ],
 [
  "source-portion",
  "Scales the published portion amount by its recorded gram weight.",
  "Ajuste la portion publiée selon son poids enregistré en grammes.",
  "Skaliert die veröffentlichte Portionsmenge nach ihrem gespeicherten Grammgewicht.",
  "Ajusta a quantidade da porção publicada pelo peso registrado em gramas."
 ],
 [
  "choose-food-and-quantity",
  "Choose a food and enter its quantity.",
  "Choisissez un aliment et saisissez sa quantité.",
  "Wähle ein Lebensmittel und gib seine Menge ein.",
  "Escolha um alimento e informe sua quantidade."
 ],
 [
  "reviewed-servings",
  "Uses the food nutrition-basis servings entered for this review.",
  "Utilise les portions de la base nutritionnelle saisies pour cette vérification.",
  "Verwendet die für diese Prüfung eingegebenen Portionen der Nährwertbasis.",
  "Usa as porções da base nutricional informadas nesta revisão."
 ],
 [
  "select-portion",
  "Choose a recorded portion.",
  "Choisissez une portion enregistrée.",
  "Wähle eine gespeicherte Portion.",
  "Selecione uma porção registrada."
 ],
 [
  "reviewed-measure",
  "Uses the entered quantity and selected food source basis.",
  "Utilise la quantité saisie et la base de la source de l’aliment choisi.",
  "Verwendet die eingegebene Menge und die Quellenbasis des gewählten Lebensmittels.",
  "Usa a quantidade informada e a base da fonte do alimento selecionado."
 ],
 [
  "enter-quantity",
  "Enter a reviewed quantity.",
  "Saisissez une quantité vérifiée.",
  "Gib eine geprüfte Menge ein.",
  "Insira uma quantidade revisada."
 ],
 [
  "excluded",
  "Explicitly excluded from this recipe.",
  "Explicitement exclu de cette recette.",
  "Ausdrücklich aus diesem Rezept ausgeschlossen.",
  "Excluído explicitamente desta receita."
 ],
 [
  "choose-food",
  "Choose a food before converting its quantity.",
  "Choisissez un aliment avant de convertir sa quantité.",
  "Wähle ein Lebensmittel, bevor seine Menge umgerechnet wird.",
  "Escolha um alimento antes de converter sua quantidade."
 ],
 [
  "quantity.serving-input-range",
  "Serving amount must be a finite number from -{{limit}} to {{limit}}.",
  "Le nombre de portions doit être un nombre fini de -{{limit}} à {{limit}}.",
  "Die Portionsmenge muss eine endliche Zahl von -{{limit}} bis {{limit}} sein.",
  "A quantidade de porções deve ser um número finito de -{{limit}} a {{limit}}."
 ],
 [
  "quantity.measurement-input-range",
  "Measured quantity must be a finite number from -{{limit}} to {{limit}}.",
  "La quantité mesurée doit être un nombre fini de -{{limit}} à {{limit}}.",
  "Die gemessene Menge muss eine endliche Zahl von -{{limit}} bis {{limit}} sein.",
  "A quantidade medida deve ser um número finito de -{{limit}} a {{limit}}."
 ],
 [
  "quantity.volume-range",
  "{{label}} must be from 0.000001 to {{max}} mL.",
  "{{label}} doit être compris entre 0,000001 et {{max}} mL.",
  "{{label}} muss zwischen 0,000001 und {{max}} mL liegen.",
  "{{label}} deve estar entre 0,000001 e {{max}} mL."
 ],
 [
  "quantity.quantity-object",
  "Food quantity must be an object.",
  "La quantité de l’aliment doit être un objet.",
  "Die Lebensmittelmenge muss ein Objekt sein.",
  "A quantidade do alimento deve ser um objeto."
 ],
 [
  "quantity.portion-basis",
  "Choose a recorded portion with one measured basis for this food.",
  "Choisissez une portion enregistrée avec une seule base mesurée pour cet aliment.",
  "Wähle eine gespeicherte Portion mit genau einer gemessenen Basis für dieses Lebensmittel.",
  "Selecione uma porção registrada com uma única base medida para este alimento."
 ],
 [
  "quantity.unit",
  "Choose grams, ounces by weight, millilitres, litres or a recorded portion.",
  "Choisissez des grammes, des onces de masse, des millilitres, des litres ou une portion enregistrée.",
  "Wähle Gramm, Gewichtsunzen, Milliliter, Liter oder eine gespeicherte Portion.",
  "Escolha gramas, onças de peso, mililitros, litros ou uma porção registrada."
 ],
 [
  "quantity.unknown-weight",
  "This food has no known serving weight. Use its serving amount.",
  "Le poids de portion de cet aliment est inconnu. Utilisez son nombre de portions.",
  "Für dieses Lebensmittel ist kein Portionsgewicht bekannt. Verwende seine Portionsanzahl.",
  "O peso da porção deste alimento é desconhecido. Use sua quantidade de porções."
 ],
 [
  "quantity.unknown-volume",
  "This food has no known serving volume. Use its serving amount.",
  "Le volume de portion de cet aliment est inconnu. Utilisez son nombre de portions.",
  "Für dieses Lebensmittel ist kein Portionsvolumen bekannt. Verwende seine Portionsanzahl.",
  "O volume da porção deste alimento é desconhecido. Use sua quantidade de porções."
 ],
 [
  "quantity.serving-range",
  "The selected quantity exceeds the supported serving range.",
  "La quantité choisie dépasse la plage de portions prise en charge.",
  "Die gewählte Menge überschreitet den unterstützten Portionsbereich.",
  "A quantidade selecionada excede o intervalo de porções permitido."
 ],
 [
  "quantity.measurement-range",
  "The selected measurement exceeds the supported range.",
  "La mesure choisie dépasse la plage prise en charge.",
  "Die gewählte Messung überschreitet den unterstützten Bereich.",
  "A medida selecionada excede o intervalo permitido."
 ],
 [
  "unknown",
  "Review the food quantity and its recorded basis.",
  "Vérifiez la quantité de l’aliment et sa base enregistrée.",
  "Prüfe die Lebensmittelmenge und ihre gespeicherte Basis.",
  "Revise a quantidade do alimento e sua base registrada."
 ],
 [
  "resolved-weight",
  "Resolved weight: {{grams}} g.",
  "Poids calculé : {{grams}} g.",
  "Berechnetes Gewicht: {{grams}} g.",
  "Peso calculado: {{grams}} g."
 ]
];
export const quantityConversionMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(rows.map(([key,...values])=>['quantityConversion.'+key,values[index]])))])));
