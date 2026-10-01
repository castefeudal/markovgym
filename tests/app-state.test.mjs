import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_STATE_SCHEMA_VERSION, createInitialState } from '../src/app/state.mjs';

test('app state has one versioned shape with production defaults', () => {
  assert.equal(APP_STATE_SCHEMA_VERSION, 2);
  const state = createInitialState();
  assert.equal(state.lang, 'ru');
  assert.equal(state.theme, 'obsidian');
  assert.equal(state.coachOn, true);
  assert.deepEqual(state.settings, { rir: false, rpe: false, reading: 'balanced', loadIncrements: {} });
  for (const collection of ['favorites', 'exercisePreferences', 'workout', 'history', 'diary', 'planLimits', 'recentSearches', 'recentExercises']) {
    assert.ok(state[collection] != null, `${collection} is initialized`);
  }
});

test('app state factories return independent mutable collections', () => {
  const left = createInitialState();
  const right = createInitialState();
  left.favorites.push('0001');
  left.settings.rir = true;
  assert.deepEqual(right.favorites, []);
  assert.equal(right.settings.rir, false);
});
