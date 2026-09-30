import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomExerciseRuntimeRecord, decodeCompactExercises } from '../src/data/exercise-repository.mjs';

test('compact exercise records decode into searchable canonical records', () => {
  const dataset = {
    bp: ['chest'], eq: ['barbell'], mu: ['chest', 'triceps'],
    x: [['0001', 'Bench Press', 'Жим лёжа', 0, 0, 0, 1, [1], 'bench-press', ['setup'], ['подготовка']]],
  };
  const [exercise] = decodeCompactExercises(dataset, {
    equipmentWeight: { barbell: 5 }, normalize: (value) => value.toLowerCase(),
  });
  assert.deepEqual(exercise, {
    id: '0001', nameEn: 'Bench Press', nameRu: 'Жим лёжа', zone: 'chest', equip: 'barbell',
    target: 'chest', group: 'triceps', secondary: ['triceps'], slug: 'bench-press',
    stepsEn: ['setup'], stepsRu: ['подготовка'], idx: 0, score: 7,
    search: '0001 bench press жим лёжа chest barbell chest triceps triceps',
  });
  assert.deepEqual(decodeCompactExercises({ x: [] }), []);
});

test('custom exercise runtime records preserve tracking details and generated search metadata', () => {
  const exercise = createCustomExerciseRuntimeRecord({
    id: 'custom-1', nameEn: 'Tempo Squat', nameRu: 'Темповый присед', zone: 'legs', equip: 'barbell',
    target: 'quadriceps', secondary: ['glutes'], movementPattern: 'squat', trackingType: 'weight-reps',
    laterality: 'bilateral', compound: true, defaultSets: 4, defaultRepRange: '6–8', defaultRest: 120,
    loadIncrement: 2.5, notes: 'Control the descent', createdAt: '2026-09-30', updatedAt: '2026-09-30',
  }, 4, {
    equipmentWeight: { barbell: 5 }, normalize: (value) => value.toLowerCase(),
    transliterate: (value) => `latin ${value}`,
  });
  assert.equal(exercise.idx, 4);
  assert.equal(exercise.custom, true);
  assert.equal(exercise.trackingType, 'weight-reps');
  assert.equal(exercise.score, 17);
  assert.match(exercise.search, /latin темповый присед tempo squat quadriceps glutes/);
});
