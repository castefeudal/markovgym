import test from 'node:test';
import assert from 'node:assert/strict';
import { weightTrend } from '../src/features/progress/weight-trend.mjs';

const daily = (count) => Array.from({ length: count }, (_, index) => ({
  date: new Date(Date.UTC(2026, 8, index + 1)).toISOString().slice(0, 10),
  weight: 80 - index * 0.1,
}));

test('trend weight keeps the latest scale reading and calculates transparent 7-day means', () => {
  const result = weightTrend(daily(21));
  assert.equal(result.scaleWeightKg, 78);
  assert.equal(result.trendWeightKg, 78.3);
  assert.equal(result.delta7dKg, -0.7);
  assert.equal(result.rate21dKgPerWeek, -0.7);
  assert.equal(result.coverage7d, 100);
  assert.equal(result.coverage21d, 100);
});

test('trend comparisons stay blank until each window has three measurements', () => {
  const rows = daily(5);
  const result = weightTrend(rows);
  assert.equal(result.scaleWeightKg, 79.6);
  assert.equal(result.trendWeightKg, 79.8);
  assert.equal(result.delta7dKg, null);
  assert.equal(result.rate21dKgPerWeek, null);
});

test('trend weight ignores invalid, out-of-range and duplicate-date readings deterministically', () => {
  const result = weightTrend([
    ...daily(3),
    { date: '2026-09-03', weight: 79.1 },
    { date: '2026-02-30', weight: 80 },
    { date: '2026-09-04', weight: 600 },
  ]);
  assert.equal(result.scaleWeightKg, 79.1);
  assert.equal(result.observations7d, 3);
});
