const invalid=message=>{throw Object.assign(Error(message),{status:400});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const has=(value,key)=>Object.hasOwn(value,key);
const typed=(value,name)=>[value?.['@type']].flat().some(type=>[name,'https://schema.org/'+name,'http://schema.org/'+name].includes(type));
export function recipeListEntries(value) {
  const raw = value.itemListElement;
  const entries = Array.isArray(raw) ? [...raw] : raw === undefined ? [] : [raw];
  if (!entries.length) invalid('A recipe ItemList must contain its entries.');
  if (has(value, 'numberOfItems')) {
    const count = typeof value.numberOfItems === 'string' && /^\d+$/.test(value.numberOfItems) ? Number(value.numberOfItems) : value.numberOfItems;
    if (!Number.isSafeInteger(count) || count !== entries.length) invalid('Recipe ItemList count does not match its supplied entries. Import the complete list.');
  }
  if (entries.some(entry => object(entry) && has(entry, 'position'))) {
    const positions = new Set();
    for (const entry of entries) {
      const position = typeof entry?.position === 'string' && /^\d+$/.test(entry.position) ? Number(entry.position) : entry?.position;
      if (!['ListItem','HowToStep','HowToSection'].some(type=>typed(entry,type)) || !Number.isSafeInteger(position) || position < 1 || positions.has(position)) invalid('Every ordered recipe ListItem needs a distinct positive integer position.');
      positions.add(position);
    }
    const descending = ['ItemListOrderDescending', 'https://schema.org/ItemListOrderDescending', 'http://schema.org/ItemListOrderDescending'].includes(value.itemListOrder);
    entries.sort((a, b) => (Number(a.position) - Number(b.position)) * (descending ? -1 : 1));
  }
  return entries;
}
