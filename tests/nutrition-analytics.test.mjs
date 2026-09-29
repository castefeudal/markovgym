import test from 'node:test';
import assert from 'node:assert/strict';
import { joinNutritionAndMeasurements } from '../src/features/nutrition/nutrition-analytics.mjs';
import { adaptiveExpenditure } from '../tools/lab-calculators.mjs';

test('daily intake pairs with weight by exact date and leaves incomplete days out', () => {
  assert.deepEqual(joinNutritionAndMeasurements([
    { date: '2026-09-01', calories: 2400 },
    { date: '2026-09-02', calories: 2300, weightKg: 79.8 },
    { date: '2026-09-03', calories: 2200 },
    { date: '2026-09-03', calories: 2250 },
  ], [
    { date: '2026-09-01', weight: 80 },
    { date: '2026-09-03', weight: 79.7 },
    { date: '2026-09-04', weight: 79.5 },
  ]), [
    { date: '2026-09-01', calories: 2400, weightKg: 80 },
    { date: '2026-09-02', calories: 2300, weightKg: 79.8 },
    { date: '2026-09-03', calories: 2250, weightKg: 79.7 },
  ]);
});

test('date join ignores invalid intake and measurement values', () => {
  assert.deepEqual(joinNutritionAndMeasurements([
    { date: '2026-09-01', calories: 0 },
    { date: '2026-09-02', calories: 2300 },
  ], [
    { date: '2026-09-01', weight: 80 },
    { date: '2026-09-02', weight: -1 },
  ]), []);
});

test('paired daily logs supply the adaptive expenditure engine only after enough dates exist', () => {
  const intake = Array.from({ length: 14 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 8, index + 1)).toISOString().slice(0, 10), calories: 2400,
  }));
  const measurements = intake.map((entry, index) => ({ date: entry.date, weight: 80 - index * 0.04 }));
  const paired = joinNutritionAndMeasurements(intake, measurements);
  assert.equal(adaptiveExpenditure({ days: paired }).status, 'ok');
  assert.equal(adaptiveExpenditure({ days: paired.slice(0, 6) }).status, 'insufficient');
});
