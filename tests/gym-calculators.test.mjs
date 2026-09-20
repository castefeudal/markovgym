import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePlates, estimateOneRepMax, sessionVolume, warmupRamp } from '../tools/gym-calculators.mjs';

test('e1RM uses Epley and Brzycki and exposes a range', () => {
  const result = estimateOneRepMax(100, 5);
  assert.equal(result.epley, 116.67);
  assert.equal(result.brzycki, 112.5);
  assert.deepEqual(result.range, [112.5, 116.67]);
  assert.equal(result.confidence, 'high');
});

test('e1RM rejects out-of-range reps', () => {
  assert.equal(estimateOneRepMax(100, 0), null);
  assert.equal(estimateOneRepMax(100, 31), null);
  assert.equal(estimateOneRepMax('nope', 5), null);
});

test('plate calculator returns plates for one side and exact total', () => {
  const result = calculatePlates({ targetTotal: 100, barWeight: 20, availablePairs: { 25: 2, 20: 2, 10: 2, 5: 2 } });
  assert.equal(result.exact, true);
  assert.equal(result.achievedTotal, 100);
  assert.deepEqual(result.perSide, [20, 20]);
});

test('plate calculator returns nearest achievable total when exact is impossible', () => {
  const result = calculatePlates({ targetTotal: 101, barWeight: 20, availablePairs: { 25: 2, 5: 2 } });
  assert.equal(result.exact, false);
  assert.equal(result.achievedTotal, 90);
  assert.equal(result.difference, -11);
});

test('warm-up ramp excludes the working set', () => {
  const result = warmupRamp({ workingWeight: 100, barWeight: 20, increment: 2.5 });
  assert.ok(result.length >= 3);
  assert.ok(result.every((set) => set.weight < 100));
  assert.equal(result[0].weight, 40);
});

test('volume counts completed weighted sets only', () => {
  assert.equal(sessionVolume([
    { weight: 100, reps: 5, completed: true },
    { weight: 80, reps: 8, completed: false },
    { weight: '', reps: 12, completed: true },
  ]), 500);
});
