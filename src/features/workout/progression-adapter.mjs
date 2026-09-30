const LOAD_TRACKING = new Set([
  'weight-reps', 'reps-only', 'duration', 'distance-duration',
  'weight-duration', 'assisted-weight', 'bodyweight-added-weight',
]);
const LOADABLE_EQUIPMENT = new Set([
  'barbell', 'cable', 'leverage machine', 'dumbbell', 'ez barbell',
  'sled machine', 'kettlebell', 'olympic barbell', 'weighted',
  'smith machine', 'trap bar',
]);

/** Resolve only tracking semantics supported by exercise metadata. */
export function progressionTrackingType(exercise) {
  if (!exercise || typeof exercise !== 'object') return 'reps-only';
  const explicit = String(exercise.trackingType || '').trim();
  if (LOAD_TRACKING.has(explicit)) return explicit;
  if (exercise.zone === 'cardio') return 'duration';
  if (exercise.equip === 'assisted') return 'assisted-weight';
  if (exercise.equip === 'body weight') return 'reps-only';
  return LOADABLE_EQUIPMENT.has(String(exercise.equip || '').trim().toLowerCase()) ? 'weight-reps' : 'reps-only';
}
