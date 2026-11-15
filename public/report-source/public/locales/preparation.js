const rows=[
 [
  "state.raw",
  "raw",
  "cru",
  "roh",
  "cru"
 ],
 [
  "state.cooked",
  "cooked",
  "cuit",
  "gegart",
  "cozido"
 ],
 [
  "state.boiled",
  "boiled",
  "bouilli",
  "gekocht",
  "cozido em água"
 ],
 [
  "state.roasted",
  "roasted",
  "rôti",
  "geröstet",
  "assado"
 ],
 [
  "state.fried",
  "fried",
  "frit",
  "frittiert",
  "frito"
 ],
 [
  "state.baked",
  "baked",
  "cuit au four",
  "gebacken",
  "assado no forno"
 ],
 [
  "state.steamed",
  "steamed",
  "cuit à la vapeur",
  "gedämpft",
  "cozido no vapor"
 ],
 [
  "state.grilled",
  "grilled",
  "grillé",
  "gegrillt",
  "grelhado"
 ],
 [
  "state.broiled",
  "broiled",
  "gratiné sous le gril",
  "unter Oberhitze gegrillt",
  "grelhado sob calor superior"
 ],
 [
  "state.dried",
  "dried",
  "séché",
  "getrocknet",
  "seco"
 ],
 [
  "state.canned",
  "canned",
  "en conserve",
  "konserviert",
  "enlatado"
 ],
 [
  "state.smoked",
  "smoked",
  "fumé",
  "geräuchert",
  "defumado"
 ],
 [
  "state.frozen",
  "frozen",
  "surgelé",
  "tiefgefroren",
  "congelado"
 ],
 [
  "state.pickled",
  "pickled",
  "mariné au vinaigre",
  "eingelegt",
  "em conserva"
 ],
 [
  "state.fresh",
  "fresh",
  "frais",
  "frisch",
  "fresco"
 ],
 [
  "state.sauteed",
  "sauteed",
  "sauté",
  "sautiert",
  "salteado"
 ],
 [
  "state.thawed",
  "thawed",
  "décongelé",
  "aufgetaut",
  "descongelado"
 ],
 [
  "state.cooled",
  "cooled",
  "refroidi",
  "abgekühlt",
  "resfriado"
 ],
 [
  "state.toasted",
  "toasted",
  "grillé à sec",
  "getoastet",
  "tostado"
 ],
 [
  "form.chopped",
  "chopped",
  "haché",
  "gehackt",
  "picado"
 ],
 [
  "form.minced",
  "minced",
  "haché finement",
  "fein gehackt",
  "bem picado"
 ],
 [
  "form.diced",
  "diced",
  "en dés",
  "gewürfelt",
  "em cubinhos"
 ],
 [
  "form.sliced",
  "sliced",
  "en tranches",
  "in Scheiben",
  "fatiado"
 ],
 [
  "form.sifted",
  "sifted",
  "tamisé",
  "gesiebt",
  "peneirado"
 ],
 [
  "form.packed",
  "packed",
  "tassé",
  "fest eingefüllt",
  "compactado"
 ],
 [
  "form.ground",
  "ground",
  "moulu",
  "gemahlen",
  "moído"
 ],
 [
  "form.grated",
  "grated",
  "râpé",
  "gerieben",
  "ralado"
 ],
 [
  "form.shredded",
  "shredded",
  "émincé en fines lanières",
  "fein zerkleinert",
  "desfiado"
 ],
 [
  "form.peeled",
  "peeled",
  "pelé",
  "geschält",
  "descascado"
 ],
 [
  "form.unpeeled",
  "unpeeled",
  "non pelé",
  "ungeschält",
  "com casca"
 ],
 [
  "form.mashed",
  "mashed",
  "en purée",
  "zerdrückt",
  "amassado"
 ],
 [
  "form.crushed",
  "crushed",
  "écrasé",
  "zerstoßen",
  "triturado"
 ],
 [
  "form.whole",
  "whole",
  "entier",
  "ganz",
  "inteiro"
 ],
 [
  "form.beaten",
  "beaten",
  "battu",
  "verquirlt",
  "batido"
 ],
 [
  "form.melted",
  "melted",
  "fondu",
  "geschmolzen",
  "derretido"
 ],
 [
  "form.softened",
  "softened",
  "ramolli",
  "weich",
  "amolecido"
 ],
 [
  "form.drained",
  "drained",
  "égoutté",
  "abgetropft",
  "escorrido"
 ],
 [
  "form.rinsed",
  "rinsed",
  "rincé",
  "abgespült",
  "enxaguado"
 ],
 [
  "form.seeded",
  "seeded",
  "épépiné",
  "entkernt",
  "sem sementes"
 ],
 [
  "form.pitted",
  "pitted",
  "dénoyauté",
  "entsteint",
  "sem caroço"
 ],
 [
  "form.piece",
  "piece",
  "morceau",
  "Stück",
  "pedaço"
 ],
 [
  "form.chunk",
  "chunk",
  "gros morceau",
  "großes Stück",
  "pedaço grande"
 ],
 [
  "form.cubed",
  "cubed",
  "en cubes",
  "in Würfeln",
  "em cubos"
 ],
 [
  "form.quartered",
  "quartered",
  "en quartiers",
  "geviertelt",
  "em quartos"
 ],
 [
  "form.halved",
  "halved",
  "coupé en deux",
  "halbiert",
  "cortado ao meio"
 ],
 [
  "form.strips",
  "strips",
  "en lanières",
  "in Streifen",
  "em tiras"
 ]
];
export const preparationMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(rows.map(([key,...values])=>['preparation.'+key,values[index]])))])));
