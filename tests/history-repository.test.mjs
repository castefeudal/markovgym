import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCustomExercises, cleanEquipmentProfiles, cleanExercisePreferences, cleanHistory, cleanNutritionDays, HISTORY_SCHEMA_VERSION, mergeMissingRecords, newestFirst } from '../src/persistence/history-repository.mjs';

test('history schema is explicitly versioned', () => {
  assert.equal(HISTORY_SCHEMA_VERSION, 6);
});

test('legacy collection migration fills missing identities without replacing IndexedDB values', () => {
  const indexed = [{ id: 'same', value: 'current' }, { id: 'idb-only', value: 'keep' }];
  const legacy = [{ id: 'same', value: 'stale' }, { id: 'legacy-only', value: 'restore' }];
  const once = mergeMissingRecords(indexed, legacy, 'id');
  const twice = mergeMissingRecords(once, legacy, 'id');
  assert.deepEqual(once, [indexed[0], indexed[1], legacy[1]]);
  assert.deepEqual(twice, once);
});

test('nutrition days are date-keyed, bounded and deterministic', () => {
  assert.deepEqual(cleanNutritionDays([
    { date: '2026-09-28', calories: 2200, protein: 145, fat: 70, carbs: 250, weightKg: 80.4, accuracy: 'estimated', note: 'Restaurant meal', ignored: true },
    { date: '2026-09-28', calories: 2300, protein: 150, updatedAt: 'later' },
    { date: '2026-02-30', calories: 2000, protein: 120 },
    { date: '2026-09-27', calories: 16000, protein: 100 },
    { date: '2026-09-26', calories: 2000, protein: -1 },
  ]), [
    { date: '2026-09-28', calories: 2300, protein: 150, fat: null, carbs: null, weightKg: null, accuracy: 'unknown', note: '', updatedAt: 'later' },
  ]);
});

test('exercise preferences are bounded, normalized and drop neutral entries', () => {
  assert.deepEqual(cleanExercisePreferences({
    '0001': 'prefer', 'custom-row': 'discomfort', '0002': 'neutral', bad: 'medical-diagnosis', '': 'avoid', [ 'x'.repeat(81) ]: 'avoid',
  }), { '0001': 'prefer', 'custom-row': 'discomfort' });
  assert.deepEqual(cleanExercisePreferences([]), {});
});

test('equipment profiles keep named, deduplicated local equipment selections', () => {
  const profiles = cleanEquipmentProfiles([
    { id: 'home', nameRu: 'Дом', nameEn: 'Home', equipment: ['band', 'dumbbell', 'band'], builtIn: true, unknown: 'ignored' },
    { id: 'home', nameRu: 'Duplicate', nameEn: 'Duplicate', equipment: [] },
    { id: 'invalid', nameRu: '', nameEn: 'Invalid', equipment: ['cable'] },
  ]);
  assert.deepEqual(profiles, [{
    id: 'home', nameRu: 'Дом', nameEn: 'Home', equipment: ['band', 'dumbbell'],
    createdAt: '', updatedAt: '', builtIn: true,
  }]);
});

test('custom exercise records are typed, bounded, and retain all supported tracking modes', () => {
  const source = ['weight-reps', 'reps-only', 'duration', 'distance-duration', 'weight-duration', 'assisted-weight', 'bodyweight-added-weight']
    .map((trackingType, index) => ({
      id: `custom-${index}`,
      nameRu: `Своё ${index}`,
      nameEn: `Custom ${index}`,
      zone: 'chest',
      target: 'pectorals',
      secondary: ['triceps', 'triceps'],
      equip: 'dumbbell',
      trackingType,
      laterality: 'bilateral',
      compound: true,
      defaultSets: 4,
      defaultRepRange: '6–10',
      defaultRest: 120,
      loadIncrement: 2.5,
      notes: 'Controlled reps',
      createdAt: '2026-09-28T00:00:00.000Z',
    }));
  const clean = cleanCustomExercises(source);
  assert.equal(clean.length, 7);
  assert.deepEqual(clean.map((entry) => entry.trackingType), source.map((entry) => entry.trackingType));
  assert.deepEqual(clean[0].secondary, ['triceps']);
  assert.equal(clean[0].defaultSets, 4);
  assert.equal(clean[0].updatedAt, clean[0].createdAt);
});

test('custom exercise migration rejects malformed or duplicate identities', () => {
  const valid = { id: 'custom-a', nameRu: 'Тяга', nameEn: 'Row', zone: 'back', target: 'lats', equip: 'cable' };
  const clean = cleanCustomExercises([
    valid,
    { ...valid },
    { ...valid, id: 'built-in-id' },
    { ...valid, id: 'custom-b', trackingType: 'invented' },
  ]);
  assert.deepEqual(clean.map((entry) => entry.id), ['custom-a']);
});

test('history migration drops malformed rows, assigns stable ids, and preserves records', () => {
  const source = [
    { date: '2026-09-01', items: [{ id: '0001', setLog: [{ reps: 8 }] }] },
    null,
    { date: '2026-09-02', items: 'invalid' },
  ];
  const migrated = cleanHistory(source);
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].id, 'legacy-2026-09-01-0');
  assert.deepEqual(migrated[0].items[0].setLog, [{ reps: 8 }]);
  assert.equal(source[0].id, undefined);
});

test('history ordering is deterministic and newest first', () => {
  const records = [
    { id: 'w2', date: '2026-09-27' },
    { id: 'w4', date: '2026-09-28' },
    { id: 'w3', date: '2026-09-28' },
  ];
  assert.deepEqual(newestFirst(records).map((record) => record.id), ['w4', 'w3', 'w2']);
});

test('duplicate imported history ids remain distinct records', () => {
  const migrated = cleanHistory([
    { id: 'same', date: '2026-09-01', items: [] },
    { id: 'same', date: '2026-09-02', items: [] },
  ]);
  assert.deepEqual(migrated.map((record) => record.id), ['same', 'same-2']);
});
