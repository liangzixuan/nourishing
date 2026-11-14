const measured = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Resolve total carbohydrate for one leaf without changing its reported facts. */
export function resolvedCarbohydrateValues(values = {}) {
  const resolved = {...values};
  if (measured(resolved.carbs)) return resolved;
  delete resolved.carbs;
  if (measured(resolved.availableCarbs) && measured(resolved.fiber)) {
    const total = resolved.availableCarbs + resolved.fiber;
    if (Number.isFinite(total)) resolved.carbs = total;
  }
  return resolved;
}
