import {contributionGuidance} from './../../server/contribution-guidance.mjs';
const notes=[
 ['day-scope',contributionGuidance['day-scope'],'Les contributions couvrent toute la journée du journal. Les valeurs des recettes et repas incluent leurs ingrédients.','Die Beiträge umfassen den gesamten Tagebuchtag. Rezept- und Mahlzeitwerte enthalten ihre Zutaten.','As contribuições abrangem todo o dia do diário. Os valores de receitas e refeições incluem seus ingredientes.'],
 ['display-precision',contributionGuidance['display-precision'],'Les contributions alimentaires utilisent la précision d’affichage du journal ; les lignes arrondies peuvent ne pas totaliser la valeur cible non arrondie.','Beiträge von Lebensmitteln verwenden die gerundeten Werte aus dem Tagebuch; die Summe der Zeilen kann von der ungerundeten Summe in der Zielanzeige abweichen.','As contribuições alimentares usam a precisão de exibição do diário; a soma das linhas arredondadas pode diferir do total não arredondado da meta.'],
 ['selection-exclusions',contributionGuidance['selection-exclusions'],'Les journaux d’eau et les aliments non sélectionnés sont exclus. Les mesures inconnues restent inconnues.','Einträge für Wasser und nicht ausgewählte Lebensmittel sind ausgeschlossen. Unbekannte Messwerte bleiben unbekannt.','Os registros de água e alimentos não selecionados são excluídos. Medições desconhecidas continuam desconhecidas.'],
 ['day-exclusions',contributionGuidance['day-exclusions'],'Les mesures inconnues restent inconnues. Les journaux d’eau sont regroupés en une contribution.','Unbekannte Messwerte bleiben unbekannt. Einträge für Wasser bilden zusammen einen Beitrag.','Medições desconhecidas continuam desconhecidas. Os registros de água são agrupados em uma contribuição.'],
 ['selection-scope_one','Contributions cover {{count}} selected food entry. Daily targets still use the full day.','Les contributions couvrent {{count}} entrée alimentaire sélectionnée. Les objectifs quotidiens utilisent toujours la journée entière.','Die Beiträge umfassen {{count}} ausgewählten Lebensmitteleintrag. Tagesziele verwenden weiterhin den gesamten Tag.','As contribuições abrangem {{count}} entrada de alimento selecionada. As metas diárias continuam usando o dia inteiro.'],
 ['selection-scope_other','Contributions cover {{count}} selected food entries. Daily targets still use the full day.','Les contributions couvrent {{count}} entrées alimentaires sélectionnées. Les objectifs quotidiens utilisent toujours la journée entière.','Die Beiträge umfassen {{count}} ausgewählte Lebensmitteleinträge. Tagesziele verwenden weiterhin den gesamten Tag.','As contribuições abrangem {{count}} entradas de alimentos selecionadas. As metas diárias continuam usando o dia inteiro.']
];
const controls=[
 ['dailyTitle','Daily nutrient contributors','Contributions nutritionnelles quotidiennes','Nährstoffe pro Tag','Contribuições nutricionais diárias'],
 ['selectedTitle','Selected food contributors','Contributions des aliments sélectionnés','Beiträge ausgewählter Lebensmittel','Contribuições dos alimentos selecionados'],
 ['loading','Loading nutrient contributors…','Chargement des contributions nutritionnelles…','Nährstoffbeiträge werden geladen…','Carregando contribuições nutricionais…'],
 ['incomplete','The contribution response is incomplete. Close and reopen this view.','La réponse des contributions est incomplète. Fermez et rouvrez cette vue.','Die Beitragsantwort ist unvollständig. Schließen und öffnen Sie diese Ansicht erneut.','A resposta das contribuições está incompleta. Feche e reabra esta visualização.'],
 ['day','Full diary day','Journée entière du journal','Gesamter Tagebuchtag','Dia inteiro do diário'],
 ['selection','Selected foods','Aliments sélectionnés','Ausgewählte Lebensmittel','Alimentos selecionados'],
 ['food','Food or water','Aliment ou eau','Lebensmittel oder Wasser','Alimento ou água'],
 ['time','Group / time','Groupe / heure','Gruppe / Uhrzeit','Grupo / horário'],
 ['amount','Measured amount','Quantité mesurée','Gemessene Menge','Quantidade medida'],
 ['coverage','Coverage','Couverture','Abdeckung','Cobertura'],
 ['unknown','Unknown','Inconnu','Unbekannt','Desconhecido'],
 ['complete','Complete','Complète','Vollständig','Completa'],
 ['measured','{{known}} / {{total}} contributions measured','{{known}} / {{total}} contributions mesurées','{{known}} / {{total}} Beiträge gemessen','{{known}} / {{total}} contribuições medidas'],
 ['waterTotal','Water log total','Total du journal d’eau','Summe der Wassereinträge','Total dos registros de água'],
 ['water','Logged water','Eau enregistrée','Erfasstes Wasser','Água registrada'],
 ['waterGroup','Water logs','Journal d’eau','Wassereinträge','Registros de água'],
 ['empty','No food or water contributions are recorded for this scope.','Aucune contribution alimentaire ou d’eau n’est enregistrée pour cette portée.','Für diesen Bereich sind keine Lebensmittel- oder Wasserbeiträge erfasst.','Nenhuma contribuição de alimentos ou água foi registrada neste escopo.'],
 ['report','Open full-day nutrition report','Ouvrir le rapport nutritionnel de la journée entière','Ernährungsbericht für den ganzen Tag öffnen','Abrir relatório nutricional do dia inteiro']
];
export const contributorMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.fromEntries([...notes.map(([key,...values])=>['contributionNote.'+key,values[index]]),...controls.map(([key,...values])=>['contributors.'+key,values[index]])]) ]));
