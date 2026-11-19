/** Approximate illustrative values per listed serving, for local app testing.
 * These records are not a licensed nutrition database and are not measurements
 * taken from Cronometer. Missing keys mean unknown. Replace with verified labels
 * or an authorized dataset before using this workspace to track actual intake.
 */
const samples = [
  ['oats', 'Rolled oats, dry', '½ cup (40 g)', 40, {calories:150,protein:5,carbs:27,fat:3,fiber:4,sugar:1,sodium:0,iron:1.8,magnesium:55,potassium:145}],
  ['banana', 'Banana', '1 medium (118 g)', 118, {calories:105,protein:1.3,carbs:27,fat:0.4,fiber:3.1,sugar:14.4,sodium:1,potassium:422,vitaminC:10.3,vitaminB6:0.43}],
  ['blueberries', 'Blueberries', '1 cup (148 g)', 148, {calories:84,protein:1.1,carbs:21.4,fat:0.5,fiber:3.6,sugar:14.7,sodium:1,potassium:114,vitaminC:14.4,vitaminK:28.6}],
  ['strawberries', 'Strawberries', '1 cup (152 g)', 152, {calories:49,protein:1,carbs:11.7,fat:0.5,fiber:3,sugar:7.4,sodium:2,potassium:233,vitaminC:89.4}],
  ['apple', 'Apple with skin', '1 medium (182 g)', 182, {calories:95,protein:0.5,carbs:25.1,fat:0.3,fiber:4.4,sugar:18.9,sodium:2,potassium:195,vitaminC:8.4}],
  ['orange', 'Orange', '1 medium (131 g)', 131, {calories:62,protein:1.2,carbs:15.4,fat:0.2,fiber:3.1,sugar:12.2,sodium:0,potassium:237,vitaminC:69.7,folate:39}],
  ['avocado', 'Avocado', '½ fruit (100 g)', 100, {calories:160,protein:2,carbs:8.5,fat:14.7,fiber:6.7,sugar:0.7,sodium:7,potassium:485,magnesium:29,vitaminE:2.1,folate:81}],
  ['almonds', 'Almonds, unsalted', '1 oz (28 g)', 28, {calories:164,protein:6,carbs:6.1,fat:14.2,fiber:3.5,sugar:1.2,sodium:0,calcium:76,magnesium:76,vitaminE:7.3,iron:1.1}],
  ['walnuts', 'Walnuts', '1 oz (28 g)', 28, {calories:185,protein:4.3,carbs:3.9,fat:18.5,fiber:1.9,sugar:0.7,sodium:1,magnesium:45,potassium:125,omega3:2.6}],
  ['chia', 'Chia seeds', '2 tbsp (28 g)', 28, {calories:138,protein:4.7,carbs:11.9,fat:8.7,fiber:9.8,sugar:0,sodium:5,calcium:179,magnesium:95,omega3:5,iron:2.2}],
  ['peanut-butter', 'Peanut butter, smooth', '2 tbsp (32 g)', 32, {calories:190,protein:7,carbs:7,fat:16,fiber:2,sugar:3,sodium:140,magnesium:54,potassium:190,vitaminE:2.9}],
  ['greek-yogurt', 'Greek yogurt, plain', '¾ cup (170 g)', 170, {calories:100,protein:17,carbs:6,fat:0.7,fiber:0,sugar:6,sodium:60,calcium:190,potassium:240,vitaminB12:1.2}],
  ['milk', 'Milk, 2%', '1 cup (244 g)', 244, {calories:122,protein:8.1,carbs:11.7,fat:4.8,fiber:0,sugar:12.3,sodium:115,calcium:293,potassium:342,vitaminD:2.9,vitaminB12:1.3}],
  ['soy-milk', 'Soy beverage, unsweetened', '1 cup (240 mL)', 240, {calories:80,protein:7,carbs:4,fat:4,fiber:2,sugar:1,sodium:85,calcium:300,potassium:300}],
  ['egg', 'Egg, large', '1 large (50 g)', 50, {calories:72,protein:6.3,carbs:0.4,fat:4.8,fiber:0,sugar:0.2,sodium:71,cholesterol:186,iron:0.9,choline:147,vitaminB12:0.5,selenium:15.4}],
  ['chicken', 'Chicken breast, cooked', '3 oz (85 g)', 85, {calories:140,protein:26.3,carbs:0,fat:3.1,fiber:0,sugar:0,sodium:63,potassium:218,niacin:11.8,selenium:23.5}],
  ['salmon', 'Salmon, cooked', '3 oz (85 g)', 85, {calories:175,protein:18.8,carbs:0,fat:10.5,fiber:0,sugar:0,sodium:52,potassium:326,omega3:1.8,vitaminD:11,vitaminB12:2.8,selenium:31}],
  ['tuna', 'Tuna, canned in water', '3 oz drained (85 g)', 85, {calories:99,protein:21.7,carbs:0,fat:0.7,fiber:0,sugar:0,sodium:247,potassium:201,omega3:0.2,vitaminB12:2.5}],
  ['tofu', 'Tofu, firm', '½ cup (126 g)', 126, {calories:181,protein:21.8,carbs:3.5,fat:11,fiber:2.9,sugar:0.8,sodium:18,calcium:430,iron:3.4,magnesium:73}],
  ['lentils', 'Lentils, cooked', '1 cup (198 g)', 198, {calories:230,protein:17.9,carbs:39.9,fat:0.8,fiber:15.6,sugar:3.6,sodium:4,potassium:731,iron:6.6,folate:358,magnesium:71}],
  ['chickpeas', 'Chickpeas, cooked', '1 cup (164 g)', 164, {calories:269,protein:14.5,carbs:45,fat:4.2,fiber:12.5,sugar:7.9,sodium:11,potassium:477,iron:4.7,folate:282}],
  ['black-beans', 'Black beans, cooked', '1 cup (172 g)', 172, {calories:227,protein:15.2,carbs:40.8,fat:0.9,fiber:15,sugar:0.6,sodium:2,potassium:611,iron:3.6,magnesium:120}],
  ['brown-rice', 'Brown rice, cooked', '1 cup (195 g)', 195, {calories:216,protein:5,carbs:44.8,fat:1.8,fiber:3.5,sugar:0.7,sodium:10,magnesium:84,potassium:84,selenium:19}],
  ['quinoa', 'Quinoa, cooked', '1 cup (185 g)', 185, {calories:222,protein:8.1,carbs:39.4,fat:3.6,fiber:5.2,sugar:1.6,sodium:13,magnesium:118,iron:2.8,folate:78}],
  ['whole-wheat-bread', 'Whole wheat bread', '1 slice (32 g)', 32, {calories:81,protein:4,carbs:13.8,fat:1.1,fiber:1.9,sugar:1.4,sodium:145,iron:0.8,magnesium:23}],
  ['pasta', 'Whole wheat pasta, cooked', '1 cup (140 g)', 140, {calories:174,protein:7.5,carbs:37.2,fat:0.8,fiber:6.3,sugar:1.1,sodium:4,iron:1.7,magnesium:76}],
  ['spinach', 'Spinach, raw', '2 cups (60 g)', 60, {calories:14,protein:1.7,carbs:2.2,fat:0.2,fiber:1.3,sugar:0.3,sodium:47,potassium:335,iron:1.6,magnesium:47,vitaminA:281,vitaminC:17,vitaminK:290,folate:116}],
  ['broccoli', 'Broccoli, cooked', '1 cup (156 g)', 156, {calories:55,protein:3.7,carbs:11.2,fat:0.6,fiber:5.1,sugar:2.2,sodium:64,potassium:457,vitaminC:101,vitaminK:220,folate:168}],
  ['carrot', 'Carrot, raw', '1 medium (61 g)', 61, {calories:25,protein:0.6,carbs:5.8,fat:0.1,fiber:1.7,sugar:2.9,sodium:42,potassium:195,vitaminA:509}],
  ['sweet-potato', 'Sweet potato, baked', '1 medium (114 g)', 114, {calories:103,protein:2.3,carbs:23.6,fat:0.2,fiber:3.8,sugar:7.4,sodium:41,potassium:542,vitaminA:1096,vitaminC:22}],
  ['tomato', 'Tomato, raw', '1 medium (123 g)', 123, {calories:22,protein:1.1,carbs:4.8,fat:0.2,fiber:1.5,sugar:3.2,sodium:6,potassium:292,vitaminC:17,lycopene:3165}],
  ['bell-pepper', 'Red bell pepper', '1 medium (119 g)', 119, {calories:37,protein:1.2,carbs:7.2,fat:0.4,fiber:2.5,sugar:5,sodium:5,potassium:251,vitaminC:152,vitaminA:187}],
  ['cucumber', 'Cucumber with peel', '1 cup (104 g)', 104, {calories:16,protein:0.7,carbs:3.8,fat:0.1,fiber:0.5,sugar:1.7,sodium:2,potassium:153,water:99,vitaminK:17}],
  ['mushrooms', 'White mushrooms', '1 cup (70 g)', 70, {calories:15,protein:2.2,carbs:2.3,fat:0.2,fiber:0.7,sugar:1.4,sodium:4,potassium:223,riboflavin:0.28,selenium:6.5}],
  ['olive-oil', 'Olive oil', '1 tbsp (14 g)', 14, {calories:119,protein:0,carbs:0,fat:13.5,fiber:0,sugar:0,sodium:0,vitaminE:1.9,vitaminK:8.1,monounsaturatedFat:9.8,saturatedFat:1.9}],
  ['cheddar', 'Cheddar cheese', '1 oz (28 g)', 28, {calories:114,protein:7,carbs:0.4,fat:9.4,fiber:0,sugar:0.1,sodium:180,calcium:200,vitaminB12:0.3,saturatedFat:6}],
  ['hummus', 'Hummus', '¼ cup (60 g)', 60, {calories:100,protein:4.8,carbs:8.6,fat:5.8,fiber:3.6,sugar:0.2,sodium:227,iron:1.5,potassium:137}],
  ['dark-chocolate', 'Dark chocolate, 70–85%', '1 oz (28 g)', 28, {calories:170,protein:2.2,carbs:13,fat:12.1,fiber:3.1,sugar:6.8,sodium:6,iron:3.4,magnesium:64,caffeine:23,theobromine:225}],
  ['coffee', 'Coffee, brewed', '1 cup (240 mL)', 240, {calories:2,protein:0.3,carbs:0,fat:0,fiber:0,sugar:0,sodium:5,potassium:116,caffeine:95,water:239}],
  ['water', 'Water', '1 glass (250 mL)', 250, {calories:0,protein:0,carbs:0,fat:0,fiber:0,sugar:0,sodium:0,water:250}],
];

export const seedFoodNotice = 'Illustrative sample values, rounded for software testing. Replace them with verified food labels or an authorized nutrient dataset before tracking actual intake.';
export function seedFoods() {
  return samples.map(([key, name, serving, grams, nutrients]) => ({id: `sample-${key}`, name, serving, grams, nutrients: {...nutrients}, source: seedFoodNotice, sample: true}));
}
