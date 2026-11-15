// Reviewed category identities from the installed public composition tables.
// Mixed groups (for example Fruits and Fruit Juices) cannot classify each food.
// Names and liquid measurement units never imply membership.
const groups=(prefix,ids)=>ids.map(id=>prefix+id);
export const catalogSearchCategories=Object.freeze({
 restaurants:Object.freeze(['usda-category:25']),
 beverages:Object.freeze([
  'usda-category:14','cnf:cnf-2015:group:14',
  ...groups('afcd:afcd-release3:group:',['11','29']),
  ...groups('nevo:nevo-2025-v9:group:',['Alcoholische dranken','Niet-alcoholische dranken']),
  ...groups('bls:bls-4-0-2025:group:',['N','P']),
  ...groups('cofid:cofid-2021:group:',['P','PA','PAA','PAC','PCA','PCC','PE','Q','QA','QC','QE','QF','QG','QI','QK','FC','BH']),
  ...groups('frida:frida-6-1-2026:group:',['45','54','106','107','111','112','113','114','115','116','117','186']),
  ...groups('wweia-category:2021-2023:',['1402','7002','7004','7006','7008','7102','7104','7106','7202','7204','7206','7208','7220','7302','7304','7502','7504','7506','7702','7704','7802','7804','9202','9204'])
 ])
});
