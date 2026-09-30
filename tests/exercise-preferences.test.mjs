import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanExercisePreferences, exercisePreference, exercisePreferenceScore } from '../src/features/exercise/preferences.mjs';

test('exercise preferences give transparent ranking weights for declared choices', () => {
  assert.equal(exercisePreferenceScore('prefer'), 115);
  assert.equal(exercisePreferenceScore('lessOften'), -85);
  for (const choice of ['avoid', 'unavailable', 'discomfort']) assert.equal(exercisePreferenceScore(choice), -10000);
  assert.equal(exercisePreferenceScore('neutral'), 0);
  assert.equal(exercisePreferenceScore('unknown'), 0);
});

test('preference normalization keeps only known exercise ids and explicit valid choices', () => {
  const clean = cleanExercisePreferences({
    '0001': 'prefer', '0002': 'neutral', '0003': 'unknown', 'not-in-library': 'avoid',
  }, (id) => id.startsWith('000'), 3);
  assert.deepEqual(clean, { '0001': 'prefer' });
  assert.equal(exercisePreference(clean, '0001'), 'prefer');
  assert.equal(exercisePreference(clean, 'missing'), 'neutral');
  assert.deepEqual(cleanExercisePreferences([], () => true), {});
});
