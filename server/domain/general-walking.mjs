const source = 'https://nourishing.app/general-walking.html';
export const walkingEdition = 'Nourishing General Walking (2026)';
const preset = (code, effort, met, description) => Object.freeze({code, effort, met, description, source, edition:walkingEdition});

export const walkingPresets = Object.freeze([
  preset('walk-light', 'light', 3, 'Easy walking at a comfortable pace.'),
  preset('walk-moderate', 'moderate', 4.8, 'Brisk walking with a noticeable increase in breathing.'),
  preset('walk-hard', 'hard', 8, 'Vigorous walking with rapid breathing.'),
  preset('walk-very-hard', 'veryHard', 10, 'Walking at the highest effort you can sustain.'),
]);
export const walkingEfforts = Object.freeze(Object.fromEntries(walkingPresets.map(row => [row.code, row.effort])));
export const walkingPreset = code => walkingPresets.find(row => row.code === code);

export function matchesWalkingSnapshot(value) {
  const preset = walkingPreset(value.code);
  return Boolean(preset && value.source === preset.source && value.edition === preset.edition &&
    value.met === preset.met && value.description === preset.description);
}
