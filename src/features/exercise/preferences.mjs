export const EXERCISE_PREFERENCE_VALUES = Object.freeze([
  'prefer', 'neutral', 'lessOften', 'avoid', 'unavailable', 'discomfort',
]);

export function exercisePreference(preferences, id) {
  return EXERCISE_PREFERENCE_VALUES.includes(preferences?.[id]) ? preferences[id] : 'neutral';
}

/** Transparent ranking contribution for the user's explicit preference. */
export function exercisePreferenceScore(preference) {
  if (preference === 'prefer') return 115;
  if (preference === 'lessOften') return -85;
  if (['avoid', 'unavailable', 'discomfort'].includes(preference)) return -10000;
  return 0;
}

export function cleanExercisePreferences(value, isKnownExercise = () => false, maxEntries = Infinity) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const clean = {};
  Object.keys(value).slice(0, Math.max(0, maxEntries)).forEach((id) => {
    const preference = value[id];
    if (isKnownExercise(id) && EXERCISE_PREFERENCE_VALUES.includes(preference) && preference !== 'neutral') {
      clean[id] = preference;
    }
  });
  return clean;
}
