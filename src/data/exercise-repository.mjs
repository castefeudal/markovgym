/** Decode the compact public exercise dataset into the app's canonical records. */
export function decodeCompactExercises(raw, { equipmentWeight = {}, normalize = (value) => String(value ?? '').toLowerCase().trim() } = {}) {
  if (!raw || !Array.isArray(raw.x) || !raw.x.length) return [];
  return raw.x.map((record, index) => {
    const exercise = {
      id: record[0], nameEn: record[1], nameRu: record[2],
      zone: raw.bp[record[3]], equip: raw.eq[record[4]],
      target: raw.mu[record[5]], group: raw.mu[record[6]],
      secondary: record[7].map((muscleIndex) => raw.mu[muscleIndex]),
      slug: record[8], stepsEn: record[9] || [], stepsRu: record[10] || [], idx: index,
    };
    exercise.score = (exercise.secondary.length * 2) + (equipmentWeight[exercise.equip] || 1);
    exercise.search = normalize([
      exercise.id, exercise.nameEn, exercise.nameRu, exercise.zone, exercise.equip,
      exercise.target, exercise.group, exercise.secondary.join(' '),
    ].join(' '));
    return exercise;
  });
}

/** Map a validated custom exercise into the shared runtime exercise shape. */
export function createCustomExerciseRuntimeRecord(record, index, {
  equipmentWeight = {}, normalize = (value) => String(value ?? '').toLowerCase().trim(),
  transliterate = (value) => value,
} = {}) {
  const secondary = Array.isArray(record.secondary) ? record.secondary.slice() : [];
  const exercise = {
    id: String(record.id), nameEn: record.nameEn, nameRu: record.nameRu,
    zone: record.zone, equip: record.equip, target: record.target, group: record.target,
    secondary, slug: '', stepsEn: [], stepsRu: [], idx: index,
    custom: true, image: record.image || null, movementPattern: record.movementPattern,
    trackingType: record.trackingType, laterality: record.laterality,
    compound: !!record.compound, defaultSets: record.defaultSets,
    defaultRepRange: record.defaultRepRange, defaultRest: record.defaultRest,
    loadIncrement: record.loadIncrement, notes: record.notes || '',
    createdAt: record.createdAt, updatedAt: record.updatedAt,
  };
  exercise.score = (exercise.compound ? 10 : 4) + secondary.length * 2 + (equipmentWeight[exercise.equip] || 1);
  exercise.search = normalize([
    exercise.id, exercise.nameEn, exercise.nameRu, exercise.zone, exercise.equip,
    exercise.target, exercise.group, secondary.join(' '), exercise.movementPattern || '',
    exercise.notes, transliterate([exercise.nameRu, exercise.nameEn, exercise.target, secondary.join(' ')].join(' ')),
  ].join(' '));
  return exercise;
}
