import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRepRange, recommendProgression } from '../tools/progression.mjs';

test('parses common rep-range notation', () => {
  assert.deepEqual(parseRepRange('8-10'), [8, 10]);
  assert.deepEqual(parseRepRange('8–12'), [8, 12]);
  assert.deepEqual(parseRepRange(8), [8, 8]);
  assert.equal(parseRepRange('AMRAP'), null);
});

test('holds load when rep floor is not secured', () => {
  const result = recommendProgression({
    previousSets: [
      { weight: 100, reps: 8, completed: true },
      { weight: 100, reps: 8, completed: true },
      { weight: 100, reps: 7, completed: true },
    ],
    targetRepRange: '8-10',
    increment: 2.5,
  });
  assert.equal(result.action, 'hold-load');
  assert.equal(result.nextLoad, 100);
  assert.equal(result.reason, 'rep-floor-not-yet-secured');
});

test('holds load while building through the target range', () => {
  const result = recommendProgression({
    previousSets: [
      { weight: 100, reps: 10, completed: true },
      { weight: 100, reps: 9, completed: true },
      { weight: 100, reps: 9, completed: true },
    ],
    targetRepRange: '8-10',
  });
  assert.equal(result.action, 'hold-load');
  assert.equal(result.reason, 'build-reps-within-range');
});

test('increases load only when every completed set reaches the top', () => {
  const result = recommendProgression({
    previousSets: [
      { weight: 100, reps: 10, completed: true, rir: 2 },
      { weight: 100, reps: 10, completed: true, rir: 2 },
      { weight: 100, reps: 10, completed: true, rir: 1 },
    ],
    targetRepRange: '8-10',
    increment: 2.5,
  });
  assert.equal(result.action, 'increase-load');
  assert.equal(result.nextLoad, 102.5);
  assert.equal(result.reason, 'all-sets-at-top-of-range');
});

test('does not increase after maximal-effort top-range sets', () => {
  const result = recommendProgression({
    previousSets: [
      { weight: 100, reps: 10, completed: true, rpe: 10 },
      { weight: 100, reps: 10, completed: true, rpe: 10 },
      { weight: 100, reps: 10, completed: true, rpe: 10 },
    ],
    targetRepRange: '8-10',
    increment: 2.5,
  });
  assert.equal(result.action, 'hold-load');
  assert.equal(result.reason, 'top-range-but-maximal-effort');
});

test('refuses to invent a recommendation from mixed working loads', () => {
  const result = recommendProgression({
    previousSets: [
      { weight: 100, reps: 10, completed: true },
      { weight: 90, reps: 10, completed: true },
    ],
    targetRepRange: '8-10',
  });
  assert.equal(result.status, 'insufficient');
  assert.equal(result.reason, 'mixed-working-weights');
});
