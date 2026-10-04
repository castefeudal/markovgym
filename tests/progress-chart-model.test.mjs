import test from 'node:test';
import assert from 'node:assert/strict';
import { progressChartModel } from '../src/features/progress/chart-model.mjs';

test('responsive chart geometry keeps the same measurements and averages', () => {
  const entries = [{ date: '2026-01-01', weight: 82 }, { date: '2026-01-08', weight: 81 }];
  const desktop = progressChartModel(entries, 'weight');
  const mobile = progressChartModel(entries, 'weight', { width: 280 });
  assert.equal(mobile.width, 280);
  assert.equal(mobile.points[1].x, 270);
  assert.deepEqual(mobile.ticks, desktop.ticks);
  assert.deepEqual(mobile.points.map(({ date, value }) => ({ date, value })), desktop.points.map(({ date, value }) => ({ date, value })));
  assert.deepEqual(mobile.averagePoints.map(point => point.y), desktop.averagePoints.map(point => point.y));
});

test('progress chart reports insufficient data for fewer than two valid measurements', () => {
  assert.deepEqual(progressChartModel([], 'weight'), { status: 'insufficient', count: 0, points: [] });
  const one = progressChartModel([{ date: '2026-01-01', weight: 82 }], 'weight');
  assert.equal(one.status, 'insufficient');
  assert.equal(one.count, 1);
});

test('progress chart sorts and deduplicates dates, keeping the latest value for a date', () => {
  const model = progressChartModel([
    { date: '2026-01-03', weight: 80 },
    { date: '2026-01-01', weight: 82 },
    { date: '2026-01-03', weight: 79 },
    { date: '2026-01-02', weight: 81 },
  ], 'weight');
  assert.deepEqual(model.points.map(({ date, value }) => [date, value]), [
    ['2026-01-01', 82], ['2026-01-02', 81], ['2026-01-03', 79],
  ]);
});

test('progress chart caps history at the latest 60 observations', () => {
  const entries = Array.from({ length: 75 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    weight: 80 + index / 10,
  }));
  const model = progressChartModel(entries, 'weight');
  assert.equal(model.count, 60);
  assert.equal(model.firstDate, entries[15].date);
  assert.equal(model.lastDate, entries[74].date);
});

test('flat data has a finite plot range and rolling averages use up to seven observations', () => {
  const entries = Array.from({ length: 8 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    weight: index === 7 ? 87 : 80,
  }));
  const model = progressChartModel(entries, 'weight');
  assert.equal(model.status, 'ready');
  assert.equal(model.averagePoints.length, 8);
  assert.ok(model.points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y) && x >= 42 && x <= 550 && y >= 14 && y <= 176));
  assert.ok(model.averagePoints.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)));
  assert.ok(model.ticks.every(({ value, y, labelY }) => Number.isFinite(value) && Number.isFinite(y) && Number.isFinite(labelY)));
  assert.equal(model.averagePoints[6].y, model.points[6].y);
  assert.notEqual(model.averagePoints[7].y, model.points[7].y);
  assert.match(model.linePath, /^M/);
  assert.match(model.averagePath, /^M/);
});

test('progress chart discards malformed dates and non-finite values', () => {
  const model = progressChartModel([
    { date: '2026-02-30', weight: 70 },
    { date: '2026-02-01', weight: Infinity },
    { date: 'not-a-date', weight: 75 },
    { date: '2026-02-02', weight: 74 },
  ], 'weight');
  assert.deepEqual(model, { status: 'insufficient', count: 1, points: [{ date: '2026-02-02', value: 74 }] });
});
