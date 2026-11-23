export const defaultDiaryGroup = 'Uncategorized';

// Keep custom groups in their saved slots, including on older accounts.
export function diaryGroups(configured = []) {
  return configured.includes(defaultDiaryGroup) ? [...configured] : [...configured, defaultDiaryGroup];
}

export function hasDiaryGroup(configured, name) {
  return name === defaultDiaryGroup || configured.includes(name);
}
