// This deterministic helper selects recorded facts; it does not interpret advice.
const terms={
 en:{protein:['protein','proteins'],fiber:['fiber','fibers','fibre','fibres'],carbs:['carb','carbs','carbohydrate','carbohydrates'],sodium:['sodium'],fat:['fat','fats'],energy:['energy','calorie','calories','caloric','burn','burned','burnt','expenditure','balance','exercise'],water:['water','hydration','hydrate','hydrating','hydrated']},
 fr:{protein:['proteine','proteines'],fiber:['fibre','fibres'],carbs:['glucide','glucides'],sodium:['sodium'],fat:['lipide','lipides','graisse','graisses','grasse','gras'],energy:['energie','calorie','calories','depense','depenses','bilan','exercice'],water:['eau','hydratation','hydrater']},
 de:{protein:['protein','proteine','eiweiss'],fiber:['ballaststoff','ballaststoffe','ballaststoffen'],carbs:['kohlenhydrat','kohlenhydrate','kohlenhydraten'],sodium:['natrium'],fat:['fett','fette','fetten'],energy:['energie','kalorie','kalorien','energieverbrauch','energiebilanz','bewegung','sport'],water:['wasser','flussigkeit','flussigkeitszufuhr','hydratation']},
 'pt-BR':{protein:['proteina','proteinas'],fiber:['fibra','fibras'],carbs:['carboidrato','carboidratos'],sodium:['sodio'],fat:['gordura','gorduras','lipidio','lipidios'],energy:['energia','caloria','calorias','gasto','balanco','exercicio'],water:['agua','hidratacao','hidratar']},
};
const normalize=text=>text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replaceAll('ß','ss');
export function localCoachIntent(question,language='en'){
 const words=new Set(normalize(question).match(/\p{L}+/gu)??[]),localized=Object.hasOwn(terms,language)?terms[language]:terms.en;
 const has=kind=>[...terms.en[kind],...localized[kind]].some(word=>words.has(word));
 const nutrient=['protein','fiber','carbs','sodium','fat'].find(has),selected=nutrient?[nutrient]:has('energy')?['calories']:['calories','protein'];
 return {waterOnly:has('water'),selected,includeEnergy:has('energy')||selected.includes('calories')};
}
