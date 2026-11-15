const usReference='https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels';
const legacyUsReference='https://www.govinfo.gov/content/pkg/CFR-2015-title21-vol2/pdf/CFR-2015-title21-vol2-sec101-9.pdf';
// Pre-2016 values and forms are independent of the current US table.
const legacyUsRows=[
 ['calories','Calories','kcal'],['fat','Total fat','g',65],['saturatedFat','Saturated fat','g',20],['transFat','Trans fat','g'],
 ['monounsaturatedFat','Monounsaturated fat','g'],['polyunsaturatedFat','Polyunsaturated fat','g'],
 ['cholesterol','Cholesterol','mg',300],['sodium','Sodium','mg',2400],['potassium','Potassium','mg',3500],
 ['carbs','Total carbohydrate (includes fiber)','g',300],['fiber','Dietary fiber','g',25],['solubleFiber','Soluble fiber','g'],['insolubleFiber','Insoluble fiber','g'],
 ['sugar','Sugars','g'],['sugarAlcohol','Sugar alcohols','g'],['protein','Protein','g',50,'proteinCorrected'],
 ['vitaminAIU','Vitamin A (IU)','IU',5000],['vitaminC','Vitamin C','mg',60],['calcium','Calcium','mg',1000],['iron','Iron','mg',18],
 ['vitaminD','Vitamin D','µg',400],['vitaminEIU','Vitamin E (IU)','IU',30],['vitaminK','Vitamin K','µg',80],
 ['thiamin','Thiamin','mg',1.5],['riboflavin','Riboflavin','mg',1.7],['niacin','Niacin','mg',20],['vitaminB6','Vitamin B6','mg',2],
 ['totalFolates','Folate / folic acid / folacin (total mass)','µg',400],['vitaminB12','Vitamin B12','µg',6],['biotin','Biotin','µg',300],['pantothenicAcid','Pantothenic acid','mg',10],
 ['phosphorus','Phosphorus','mg',1000],['iodine','Iodine','µg',150],['magnesium','Magnesium','mg',400],['zinc','Zinc','mg',15],['selenium','Selenium','µg',70],
 ['copper','Copper','mg',2],['manganese','Manganese','mg',2],['chromium','Chromium','µg',120],['molybdenum','Molybdenum','µg',75],['chloride','Chloride','mg',3400],
].map(([id,name,unit,dailyValue=null,percentId=id])=>Object.freeze({id,name,unit,dailyValue,percentId,amountAllowed:true,
 ...(id==='vitaminD'?{defaultInputUnit:'IU',referenceUnit:'IU'}:{}),
 ...(['vitaminAIU','vitaminEIU'].includes(id)?{guidance:'Copy the IU amount or %DV. Choose a form only if the label identifies it. Known shares of the total IU amount allow a separate activity conversion. Unknown forms keep IU only.'}:{})}));
// These are label reference values, not personal targets. Forms are explicit.
const usRows=[
 ['calories','Calories','kcal'],['fat','Total fat','g',78],['saturatedFat','Saturated fat','g',20],['transFat','Trans fat','g'],
 ['cholesterol','Cholesterol','mg',300],['sodium','Sodium','mg',2300],['carbs','Total carbohydrate (includes fiber)','g',275],
 ['fiber','Dietary fiber','g',28],['sugar','Total sugars','g'],['addedSugar','Added sugars','g',50],['protein','Protein','g',50,'proteinCorrected'],
 ['vitaminD','Vitamin D','µg',20],['calcium','Calcium','mg',1300],['iron','Iron','mg',18],['potassium','Potassium','mg',4700],
 ['vitaminA','Vitamin A (RAE)','µg',900],['vitaminC','Vitamin C','mg',90],['vitaminE','Vitamin E (alpha-tocopherol)','mg',15],['vitaminK','Vitamin K','µg',120],
 ['thiamin','Thiamin','mg',1.2],['riboflavin','Riboflavin','mg',1.3],['niacinEquivalents','Niacin equivalents (NE)','mg',16],['vitaminB6','Vitamin B6','mg',1.7],
 ['folate','Folate (DFE)','µg',400],['folicAcid','Folic acid (parenthetical amount)','µg'],['vitaminB12','Vitamin B12','µg',2.4],['biotin','Biotin','µg',30],
 ['pantothenicAcid','Pantothenic acid','mg',5],['phosphorus','Phosphorus','mg',1250],['iodine','Iodine','µg',150],['magnesium','Magnesium','mg',420],
 ['zinc','Zinc','mg',11],['selenium','Selenium','µg',55],['copper','Copper','mg',0.9],['manganese','Manganese','mg',2.3],
 ['chromium','Chromium','µg',35],['molybdenum','Molybdenum','µg',45],['chloride','Chloride','mg',2300],['choline','Choline','mg',550],
].map(([id,name,unit,dailyValue=null,percentId=id])=>Object.freeze({id,name,unit,dailyValue,percentId,amountAllowed:true}));
const canadaReference='https://www.canada.ca/en/health-canada/services/technical-documents-labelling-requirements/table-daily-values/nutrition-labelling.html';
const canadaRows=[
 ['calories','Calories','kcal'],['fat','Total fat','g',75],['saturatedFat','Saturated fat','g'],['transFat','Trans fat','g'],
 ['saturatedTransFat','Saturated + trans fat','g',20,false],['carbs','Total carbohydrate (includes fibre)','g'],['fiber','Dietary fibre','g',28],['sugar','Total sugars','g',100],
 ['protein','Protein','g'],['cholesterol','Cholesterol','mg',300],['sodium','Sodium','mg',2300],['potassium','Potassium','mg',3400],['calcium','Calcium','mg',1300],['iron','Iron','mg',18],
 ['vitaminA','Vitamin A (RAE)','µg',900],['vitaminC','Vitamin C','mg',90],['vitaminD','Vitamin D','µg',20],['vitaminECanada','Vitamin E (Canadian label equivalents)','mg',15],['vitaminK','Vitamin K','µg',120],
 ['thiamin','Thiamin','mg',1.2],['riboflavin','Riboflavin','mg',1.3],['niacinEquivalents','Niacin equivalents (NE)','mg',16],['vitaminB6','Vitamin B6','mg',1.7],
 ['folate','Folate (DFE)','µg',400],['vitaminB12','Vitamin B12','µg',2.4],['choline','Choline','mg',550],['biotin','Biotin','µg',30],['pantothenicAcid','Pantothenic acid','mg',5],
 ['phosphorus','Phosphorus','mg',1250],['iodine','Iodide','µg',150],['magnesium','Magnesium','mg',420],['zinc','Zinc','mg',11],['selenium','Selenium','µg',55],
 ['copper','Copper','mg',0.9],['manganese','Manganese','mg',2.3],['chromium','Chromium','µg',35],['molybdenum','Molybdenum','µg',45],['chloride','Chloride','mg',2300],
].map(([id,name,unit,dailyValue=null,amountAllowed=true])=>Object.freeze({id,name,unit,dailyValue,percentId:id,amountAllowed}));
const euRows=[
 ['calories','Energy','kcal',2000],['fat','Fat','g',70],['saturatedFat','Saturates','g',20],
 ['monounsaturatedFat','Monounsaturates','g'],['polyunsaturatedFat','Polyunsaturates','g'],
 ['availableCarbs','Carbohydrate (excludes fibre)','g',260],['sugar','Sugars','g',90],['sugarAlcohol','Polyols','g'],['starch','Starch','g'],['fiber','Fibre','g'],
 ['protein','Protein','g',50],['salt','Salt','g',6],
 ['vitaminARE','Vitamin A (RE)','µg',800],['vitaminD','Vitamin D','µg',5],['vitaminETE','Vitamin E (alpha-TE)','mg',12],['vitaminK','Vitamin K','µg',75],
 ['vitaminC','Vitamin C','mg',80],['thiamin','Thiamin','mg',1.1],['riboflavin','Riboflavin','mg',1.4],['niacinEquivalents','Niacin equivalents (NE)','mg',16],
 ['vitaminB6','Vitamin B6','mg',1.4],['totalFolates','Folic acid (total folates)','µg',200],['vitaminB12','Vitamin B12','µg',2.5],['biotin','Biotin','µg',50],['pantothenicAcid','Pantothenic acid','mg',6],
 ['potassium','Potassium','mg',2000],['chloride','Chloride','mg',800],['calcium','Calcium','mg',800],['phosphorus','Phosphorus','mg',700],['magnesium','Magnesium','mg',375],
 ['iron','Iron','mg',14],['zinc','Zinc','mg',10],['copper','Copper','mg',1],['manganese','Manganese','mg',2],['fluoride','Fluoride','mg',3.5],
 ['selenium','Selenium','µg',55],['chromium','Chromium','µg',40],['molybdenum','Molybdenum','µg',50],['iodine','Iodine','µg',150],
].map(([id,name,unit,dailyValue=null])=>Object.freeze({id,name,unit,dailyValue,percentId:id==='salt'?'sodium':id,amountAllowed:true,
 ...(id==='salt'?{nutrientId:'sodium',nutrientUnit:'mg',factor:400}:{}),
 ...(id==='calories'?{energyUnits:true,referenceValues:Object.freeze({kcal:2000,kJ:8400})}:{})}));
const anzRows=[
 ['calories','Energy','kcal',8700],['protein','Protein','g',50],['fat','Total fat','g',70],['saturatedFat','Saturated fat','g',24],
 ['reportedNetCarbs','Carbohydrate (Australian/NZ label)','g',310],['sugar','Sugars','g',90],['fiber','Dietary fibre','g',30],['sodium','Sodium','mg',2300],
 ['transFat','Trans fat','g'],['monounsaturatedFat','Monounsaturated fat','g'],['polyunsaturatedFat','Polyunsaturated fat','g'],['cholesterol','Cholesterol','mg'],
 ['sugarAlcohol','Sugar alcohols','g'],['allulose','D-allulose','g'],['starch','Starch','g'],['potassium','Potassium','mg'],['chloride','Chloride','mg'],
 ['vitaminAANZ','Vitamin A (Australian/NZ retinol equivalents)','µg',750],['thiamin','Thiamin','mg',1.1],['riboflavin','Riboflavin','mg',1.7],['niacin','Niacin (excludes tryptophan contribution)','mg',10],
 ['totalFolates','Folate (total mass)','µg',200],['vitaminB6','Vitamin B6','mg',1.6],['vitaminB12','Vitamin B12','µg',2],['biotin','Biotin','µg',30],['pantothenicAcid','Pantothenic acid','mg',5],
 ['vitaminC','Vitamin C','mg',40],['vitaminD','Vitamin D','µg',10],['vitaminEANZ','Vitamin E (Australian/NZ alpha-tocopherol equivalents)','mg',10],['vitaminK','Vitamin K','µg',80],
 ['calcium','Calcium','mg',800],['chromium','Chromium','µg',200],['copper','Copper','mg',3],['iodine','Iodine','µg',150],['iron','Iron','mg',12],['magnesium','Magnesium','mg',320],
 ['manganese','Manganese','mg',5],['molybdenum','Molybdenum','µg',250],['phosphorus','Phosphorus','mg',1000],['selenium','Selenium','µg',70],['zinc','Zinc','mg',12],
].map(([id,name,unit,dailyValue=null])=>Object.freeze({id,name,unit,dailyValue,percentId:id,amountAllowed:true,
 ...(id==='calories'?{energyUnits:true,defaultInputUnit:'kJ',referenceUnit:'kJ',energyDivisor:'4.18'}:{})}));
export const labelProfiles=Object.freeze([
 Object.freeze({id:'us-2016',name:'US 2016 label',population:'Adults and children age 4 and older',reference:usReference,rows:Object.freeze(usRows),guidance:'Protein %DV supplies corrected protein, not total protein.',aggregates:Object.freeze([])}),
 Object.freeze({id:'us-legacy',name:'Legacy US label (before 2016)',population:'Adults and children age 4 and older',reference:legacyUsReference,rows:Object.freeze(legacyUsRows),guidance:'Use the pre-2016 daily values, based on 2000 calories, even if the footnote also shows a 2500-calorie comparison. Original vitamin A and E readings stay in IU. Known forms or explicitly supplied shares allow separate activity values; otherwise those values remain unknown. Vitamin D uses 400 IU as its daily reference and is stored in micrograms (40 IU = 1 µg). Niacin is retained as niacin, not niacin equivalents. Folate, folic acid and folacin on this older label refer to total folate mass, not DFE or a separate synthetic folic acid measurement. Protein %DV supplies corrected protein, not total protein.',aggregates:Object.freeze([])}),
 Object.freeze({id:'canada-2022',name:'Canadian label (2022 Daily Values)',population:'General foods for adults and children age 4 and older',reference:canadaReference,rows:Object.freeze(canadaRows),guidance:'The saturated + trans fat %DV applies to their sum. Missing individual fats are not inferred. Canadian vitamin E equivalents remain separate from alpha-tocopherol measurements.',aggregates:Object.freeze([Object.freeze({id:'saturatedTransFat',components:Object.freeze(['saturatedFat','transFat'])})])}),
 Object.freeze({id:'eu-1169',name:'European label (EU reference intakes)',populationId:'adult',population:'Average adult reference intakes',reference:'https://www.worcestershirets.gov.uk/media/2158576/nutrition-labelling-reviewed-June-16.pdf',rows:Object.freeze(euRows),percentLabel:'% Reference Intake / NRV',servingBasis:true,guidance:'Use amounts and percentages from the same label column. Carbohydrate excludes fibre. Salt is converted to sodium. Vitamin A RE, vitamin E alpha-TE and total folates remain separate from RAE, alpha-tocopherol and DFE. Choose the energy unit printed beside the amount; the energy reference is 2000 kcal or 8400 kJ.',aggregates:Object.freeze([])}),
 Object.freeze({id:'anz-2026',name:'Australian/New Zealand label',populationId:'adult',population:'General foods using average-adult DI and RDI/ESADDI values',reference:'https://www.legislation.gov.au/F2015L00395/2026-04-30/2026-04-30/text',rows:Object.freeze(anzRows),percentLabel:'% DI / RDI / ESADDI',servingBasis:true,defaultBasis:'portion',percentPerPortion:true,guidance:'Percentages are per serving. Sodium is entered directly. Label energy uses 8700 kJ as the daily reference and 4.18 kJ per kcal. Carbohydrate may exclude more than fibre; it is retained as reported net carbohydrate with an unknown exclusion method. Total and selected net carbohydrate remain unknown until that method is known. Niacin excludes tryptophan. Vitamin A and E use separate Australian/NZ equivalence measurements; folate remains total mass, not DFE.',aggregates:Object.freeze([])}),
]);
