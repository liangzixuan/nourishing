const rows=[
 [
  "unresolved-measurement",
  "The parenthetical measurement has a range or other qualifier. Confirm the ingredient total.",
  "La mesure entre parenthèses comporte une plage ou une autre réserve. Confirmez la quantité totale de l’ingrédient.",
  "Die Angabe in Klammern enthält einen Bereich oder eine andere Einschränkung. Bestätige die Gesamtmenge der Zutat.",
  "A medida entre parênteses contém um intervalo ou outra ressalva. Confirme a quantidade total do ingrediente."
 ],
 [
  "unparsed-range",
  "The quantity range needs an explicit amount.",
  "La plage de quantité nécessite une valeur explicite.",
  "Der Mengenbereich benötigt eine ausdrückliche Mengenangabe.",
  "O intervalo de quantidade exige um valor explícito."
 ],
 [
  "conflicting-measurements",
  "The published measurements differ. Confirm the amount used.",
  "Les mesures publiées diffèrent. Confirmez la quantité utilisée.",
  "Die veröffentlichten Mengenangaben unterscheiden sich. Bestätige die verwendete Menge.",
  "As medidas publicadas diferem. Confirme a quantidade usada."
 ],
 [
  "measurement-scope",
  "Confirm whether the parenthetical measurement is the ingredient total or a package/item amount.",
  "Confirmez si la mesure entre parenthèses correspond au total de l’ingrédient ou à un emballage ou élément.",
  "Bestätige, ob die Klammerangabe die Gesamtmenge der Zutat oder eine Packung bzw. ein Stück bezeichnet.",
  "Confirme se a medida entre parênteses é o total do ingrediente ou a quantidade de uma embalagem ou unidade."
 ],
 [
  "missing-quantity",
  "Enter a positive amount for this ingredient.",
  "Saisissez une quantité positive pour cet ingrédient.",
  "Gib eine positive Menge für diese Zutat ein.",
  "Insira uma quantidade positiva para este ingrediente."
 ],
 [
  "ambiguous-number-format",
  "Confirm this comma-separated quantity with an explicit numeric override.",
  "Confirmez cette quantité contenant une virgule par une valeur numérique explicite.",
  "Bestätige diese kommagetrennte Mengenangabe durch eine ausdrückliche Zahlenkorrektur.",
  "Confirme esta quantidade com vírgula usando um valor numérico explícito."
 ],
 [
  "quantity-range",
  "Choose one amount from the source quantity range.",
  "Choisissez une quantité dans la plage indiquée par la source.",
  "Wähle eine Menge aus dem angegebenen Mengenbereich.",
  "Escolha uma quantidade no intervalo informado pela fonte."
 ],
 [
  "approximate-quantity",
  "Confirm an explicit amount for this approximate source quantity.",
  "Confirmez une quantité explicite pour cette quantité approximative de la source.",
  "Bestätige eine ausdrückliche Menge für diese ungefähre Quellenangabe.",
  "Confirme uma quantidade explícita para esta quantidade aproximada da fonte."
 ],
 [
  "to-taste",
  "A measured amount is needed for nutrition calculations.",
  "Une quantité mesurée est nécessaire pour les calculs nutritionnels.",
  "Für die Nährwertberechnung ist eine gemessene Menge erforderlich.",
  "É necessária uma quantidade medida para os cálculos nutricionais."
 ],
 [
  "optional-ingredient",
  "Confirm whether this ingredient is included and enter its amount.",
  "Confirmez si cet ingrédient est inclus et saisissez sa quantité.",
  "Bestätige, ob diese Zutat enthalten ist, und gib ihre Menge ein.",
  "Confirme se este ingrediente está incluído e informe sua quantidade."
 ],
 [
  "unmeasured-extra",
  "The additional unmeasured amount must be included in an explicit total quantity.",
  "La quantité supplémentaire non mesurée doit être incluse dans une quantité totale explicite.",
  "Die zusätzliche ungemessene Menge muss in einer ausdrücklichen Gesamtmenge enthalten sein.",
  "A quantidade adicional não medida deve ser incluída em uma quantidade total explícita."
 ],
 [
  "compound-quantity",
  "The source has more than one quantity. Enter their measured total.",
  "La source indique plusieurs quantités. Saisissez leur total mesuré.",
  "Die Quelle nennt mehrere Mengen. Gib ihre gemessene Gesamtmenge ein.",
  "A fonte contém mais de uma quantidade. Insira o total medido."
 ],
 [
  "quantity-qualifier",
  "This packing or preparation qualifier needs an explicit gram or source-portion quantity.",
  "Cette précision de tassement ou de préparation nécessite une quantité explicite en grammes ou une portion de la source.",
  "Diese Packungs- oder Zubereitungsangabe benötigt eine ausdrückliche Grammmenge oder Quellenportion.",
  "Esta indicação de compactação ou preparo exige uma quantidade explícita em gramas ou uma porção da fonte."
 ],
 [
  "package-quantity",
  "Package size and edible or drained weight need confirmation.",
  "Confirmez la taille de l’emballage et le poids comestible ou égoutté.",
  "Packungsgröße und essbares bzw. abgetropftes Gewicht müssen bestätigt werden.",
  "Confirme o tamanho da embalagem e o peso comestível ou escorrido."
 ],
 [
  "ingredient-part",
  "The source names a food part or extracted juice. Enter the measured amount of that part.",
  "La source indique une partie d’aliment ou du jus extrait. Saisissez la quantité mesurée de cette partie.",
  "Die Quelle nennt einen Lebensmittelteil oder ausgepressten Saft. Gib die gemessene Menge dieses Teils ein.",
  "A fonte indica uma parte do alimento ou suco extraído. Insira a quantidade medida dessa parte."
 ],
 [
  "trailing-fraction",
  "Confirm a measured amount for this trailing fractional quantity.",
  "Confirmez une quantité mesurée pour cette fraction placée en fin de texte.",
  "Bestätige eine gemessene Menge für diese nachgestellte Bruchangabe.",
  "Confirme uma quantidade medida para esta fração no final do texto."
 ],
 [
  "missing-description",
  "Enter the food name for this ingredient.",
  "Saisissez le nom de l’aliment pour cet ingrédient.",
  "Gib den Lebensmittelnamen für diese Zutat ein.",
  "Insira o nome do alimento para este ingrediente."
 ],
 [
  "structured-name-heading",
  "The structured ingredient name looks like a heading. Correct the ingredient text and quantity.",
  "Le nom structuré de l’ingrédient ressemble à un titre. Corrigez le texte et la quantité de l’ingrédient.",
  "Der strukturierte Zutatenname wirkt wie eine Überschrift. Korrigiere Zutatentext und Menge.",
  "O nome estruturado do ingrediente parece um título. Corrija o texto e a quantidade do ingrediente."
 ],
 [
  "structured-quantity",
  "The source amount is missing or ambiguous. Enter a measured quantity.",
  "La quantité de la source est absente ou ambiguë. Saisissez une quantité mesurée.",
  "Die Quellenmenge fehlt oder ist mehrdeutig. Gib eine gemessene Menge ein.",
  "A quantidade da fonte está ausente ou é ambígua. Insira uma quantidade medida."
 ],
 [
  "structured-range",
  "The source includes a quantity bound or range. Choose an explicit amount.",
  "La source contient une limite ou une plage de quantité. Choisissez une quantité explicite.",
  "Die Quelle enthält eine Mengengrenze oder einen Bereich. Wähle eine ausdrückliche Menge.",
  "A fonte inclui um limite ou intervalo de quantidade. Escolha uma quantidade explícita."
 ],
 [
  "structured-unit-text",
  "The source unit text is unsupported. Enter grams or select a recorded portion.",
  "Le texte de l’unité de la source n’est pas pris en charge. Saisissez des grammes ou choisissez une portion enregistrée.",
  "Der Einheitentext der Quelle wird nicht unterstützt. Gib Gramm ein oder wähle eine gespeicherte Portion.",
  "O texto da unidade da fonte não é aceito. Insira gramas ou selecione uma porção registrada."
 ],
 [
  "structured-unit-code",
  "The source unit code is unsupported. Enter grams or select a recorded portion.",
  "Le code d’unité de la source n’est pas pris en charge. Saisissez des grammes ou choisissez une portion enregistrée.",
  "Der Einheitencode der Quelle wird nicht unterstützt. Gib Gramm ein oder wähle eine gespeicherte Portion.",
  "O código da unidade da fonte não é aceito. Insira gramas ou selecione uma porção registrada."
 ],
 [
  "structured-unit-conflict",
  "The source unit code and text disagree. Confirm the intended measured quantity.",
  "Le code et le texte de l’unité de la source sont contradictoires. Confirmez la quantité mesurée voulue.",
  "Einheitencode und Einheitentext der Quelle widersprechen sich. Bestätige die beabsichtigte gemessene Menge.",
  "O código e o texto da unidade da fonte não correspondem. Confirme a quantidade medida desejada."
 ],
 [
  "structured-description",
  "Review the source description for preparation or quantity qualifications and enter an explicit quantity.",
  "Vérifiez les précisions de préparation ou de quantité dans la description de la source et saisissez une quantité explicite.",
  "Prüfe die Quellenbeschreibung auf Zubereitungs- oder Mengenangaben und gib eine ausdrückliche Menge ein.",
  "Revise as indicações de preparo ou quantidade na descrição da fonte e insira uma quantidade explícita."
 ],
 [
  "multiline-source",
  "Confirm an explicit quantity for this source phrase across multiple lines.",
  "Confirmez une quantité explicite pour cette expression de la source sur plusieurs lignes.",
  "Bestätige eine ausdrückliche Menge für diesen mehrzeiligen Quelltext.",
  "Confirme uma quantidade explícita para esta expressão da fonte em várias linhas."
 ],
 [
  "entered-quantity",
  "The entered quantity is used for this review.",
  "La quantité saisie est utilisée pour cette vérification.",
  "Die eingegebene Menge wird für diese Prüfung verwendet.",
  "A quantidade informada é usada nesta revisão."
 ],
 [
  "alternative-choice.unresolved",
  "The source offers an unresolved choice. Correct the ingredient text or select the food used and enter its measured quantity.",
  "La source propose un choix non résolu. Corrigez le texte de l’ingrédient ou choisissez l’aliment utilisé et saisissez sa quantité mesurée.",
  "Die Quelle bietet eine ungeklärte Auswahl. Korrigiere den Zutatentext oder wähle das verwendete Lebensmittel und gib seine gemessene Menge ein.",
  "A fonte oferece uma escolha não resolvida. Corrija o texto do ingrediente ou selecione o alimento usado e informe sua quantidade medida."
 ],
 [
  "alternative-choice.complete",
  "The source offers alternatives. Choose the food used and confirm its measured quantity.",
  "La source propose des alternatives. Choisissez l’aliment utilisé et confirmez sa quantité mesurée.",
  "Die Quelle bietet Alternativen. Wähle das verwendete Lebensmittel und bestätige seine gemessene Menge.",
  "A fonte oferece alternativas. Escolha o alimento usado e confirme sua quantidade medida."
 ],
 [
  "alternative-choice.limited",
  "The source offers alternatives. Choose the food used and confirm its measured quantity. Suggestions cover the first four clauses; use manual search for later options.",
  "La source propose des alternatives. Choisissez l’aliment utilisé et confirmez sa quantité mesurée. Les suggestions couvrent les quatre premières options ; recherchez manuellement les suivantes.",
  "Die Quelle bietet Alternativen. Wähle das verwendete Lebensmittel und bestätige seine gemessene Menge. Vorschläge umfassen die ersten vier Optionen; suche spätere Optionen manuell.",
  "A fonte oferece alternativas. Escolha o alimento usado e confirme sua quantidade medida. As sugestões cobrem as quatro primeiras opções; use a busca manual para as seguintes."
 ],
 [
  "unknown",
  "Review this ingredient and its measured quantity.",
  "Vérifiez cet ingrédient et sa quantité mesurée.",
  "Prüfe diese Zutat und ihre gemessene Menge.",
  "Revise este ingrediente e sua quantidade medida."
 ]
];
export const ingredientWarningMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(rows.map(([key,...values])=>['ingredientWarning.'+key,values[index]])))])));
