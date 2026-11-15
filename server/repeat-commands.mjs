export const repeatCommandFields = Object.freeze({
  'repeat.save': ['id', 'foodId', 'recipeId', 'mealId', 'amount', 'quantity', 'unit', 'portionId', 'group', 'time', 'days', 'startDate', 'endDate', 'enabled'],
  'repeat.setEnabled': ['id', 'enabled'],
  'repeat.delete': ['id'],
  'repeat.apply': ['date', 'items'],
});

const invalid = message => { throw Object.assign(Error(message), {code: 400, publicMessage: message}); };
export function validateRepeatAction({type, payload}) {
  const fields = Object.hasOwn(repeatCommandFields, type) ? repeatCommandFields[type] : null;
  if (!fields || !payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => !fields.includes(key))) invalid('Check the repeat item.');
  if (['repeat.delete', 'repeat.setEnabled'].includes(type) && (typeof payload.id !== 'string' || !payload.id)) invalid('Choose a repeat item.');
  if (type === 'repeat.save' && ['foodId', 'recipeId', 'mealId'].filter(key => typeof payload[key] === 'string' && payload[key].length > 0).length !== 1) invalid('Choose one food, recipe or meal.');
  if (type === 'repeat.apply' && (!Array.isArray(payload.items) || payload.items.some(item => !item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['id', 'fingerprint'].includes(key))))) invalid('Review the repeat items first.');
  return {type, payload};
}
