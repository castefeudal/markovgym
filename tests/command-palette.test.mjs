import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCommandPalette } from '../src/features/command-palette/search.mjs';

const fixture = {
  sections: [{ hash: '#home', label: 'Home' }, { hash: '#workout', label: 'Workout' }],
  labCommands: [{ q: 'plate calculator', label: { ru: 'Диски', en: 'Plates' } }],
  muscles: ['back', 'chest'],
  exercises: [{ id: 'row', name: 'Row', target: 'back' }, { id: 'press', name: 'Press', target: 'chest' }],
  normalize: (value) => String(value ?? '').toLowerCase().trim(),
  sectionLabel: (section) => section.label,
  sectionHint: 'Section',
  muscleLabel: (muscle) => muscle,
  muscleHint: 'Muscle',
  muscleRank: (query, value) => query === value ? 10 : -1,
  exerciseLabel: (exercise) => exercise.name,
  exerciseHint: (exercise) => exercise.target,
  exerciseRank: (exercise, query) => (exercise.name.toLowerCase().includes(query) || exercise.target === query) ? 10 : -1,
};

test('empty command palette search returns canonical sections in order', () => {
  assert.deepEqual(searchCommandPalette('', fixture), [
    { type: 'section', hash: '#home', label: 'Home', hint: 'Section' },
    { type: 'section', hash: '#workout', label: 'Workout', hint: 'Section' },
  ]);
});

test('command palette returns typed section, Lab, muscle, then exercise candidates', () => {
  const result = searchCommandPalette('back', fixture);
  assert.deepEqual(result.map(({ type }) => type), ['muscle', 'exercise']);
  assert.equal(result[0].muscle, 'back');
  assert.equal(result[1].id, 'row');
});

test('Lab candidate copy follows locale and candidate groups remain bounded', () => {
  const result = searchCommandPalette('plate', { ...fixture, language: 'en' });
  assert.deepEqual(result, [{ type: 'lab', query: 'plate', label: 'Plates', hint: 'MARKOV MADE LAB' }]);
});
