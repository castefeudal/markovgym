/** Pure candidate ranking for the command palette. UI actions stay in the app. */
export function searchCommandPalette(query, {
  sections = [],
  labCommands = [],
  muscles = [],
  exercises = [],
  normalize = (value) => String(value ?? '').toLowerCase().trim(),
  sectionLabel = (section) => section.label,
  sectionHint = '',
  labHint = 'MARKOV MADE LAB',
  muscleLabel = (muscle) => muscle,
  muscleHint = '',
  muscleRank = () => -1,
  exerciseLabel = (exercise) => exercise.name,
  exerciseHint = (exercise) => exercise.target,
  exerciseRank = () => -1,
  language = 'ru',
} = {}) {
  const needle = normalize(query);
  if (!needle) return sections.map((section) => ({
    type: 'section', hash: section.hash, label: sectionLabel(section), hint: sectionHint,
  }));

  const results = [];
  for (const section of sections) {
    if (normalize(sectionLabel(section)).includes(needle)) {
      results.push({ type: 'section', hash: section.hash, label: sectionLabel(section), hint: sectionHint });
    }
  }

  labCommands.filter((command) => normalize(`${command.q} ${command.label.ru} ${command.label.en}`).includes(needle))
    .slice(0, 4)
    .forEach((command) => results.push({
      type: 'lab', query: needle, label: language === 'en' ? command.label.en : command.label.ru, hint: labHint,
    }));

  muscles.map((muscle) => ({ muscle, rank: Math.max(muscleRank(needle, muscle), muscleRank(needle, muscleLabel(muscle))) }))
    .filter((entry) => entry.rank >= 0)
    .sort((left, right) => right.rank - left.rank)
    .slice(0, 3)
    .forEach((entry) => results.push({ type: 'muscle', muscle: entry.muscle, label: muscleLabel(entry.muscle), hint: muscleHint }));

  exercises.map((exercise) => ({ exercise, rank: exerciseRank(exercise, needle) }))
    .filter((entry) => entry.rank >= 0)
    .sort((left, right) => right.rank - left.rank)
    .slice(0, 8)
    .forEach((entry) => results.push({
      type: 'exercise', id: entry.exercise.id, label: exerciseLabel(entry.exercise), hint: exerciseHint(entry.exercise),
    }));

  return results;
}
