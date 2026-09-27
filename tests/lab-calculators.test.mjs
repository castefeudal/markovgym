import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptiveExpenditure,
  bmi,
  bmr,
  bodyComposition,
  convert,
  fiberTarget,
  goalCalories,
  heartRateZones,
  macroPlan,
  paceFromDistanceTime,
  proteinTarget,
  riegelPredict,
  targetWeightAtBodyFat,
  tdee,
  waistToHeight,
} from '../tools/lab-calculators.mjs';

test('unit conversions are reversible within rounding tolerance', () => {
  const lb = convert(100, 'kg', 'lb');
  const kg = convert(lb, 'lb', 'kg');
  assert.ok(Math.abs(kg - 100) < 0.01);
  assert.equal(convert(10, 'km', 'mi'), 6.2137);
});

test('BMI and waist-to-height use metric inputs', () => {
  assert.equal(bmi({ weightKg: 81, heightCm: 180 }).value, 25);
  assert.equal(waistToHeight({ waistCm: 90, heightCm: 180 }).ratio, 0.5);
});

test('body composition preserves mass balance', () => {
  const result = bodyComposition({ weightKg: 100, bodyFatPercent: 20, heightCm: 180 });
  assert.equal(result.fatMassKg, 20);
  assert.equal(result.leanMassKg, 80);
  assert.ok(result.ffmi > 24);
});

test('target body-fat weight holds lean mass constant', () => {
  const result = targetWeightAtBodyFat({ weightKg: 100, bodyFatPercent: 20, targetBodyFatPercent: 10 });
  assert.equal(result.assumedLeanMassKg, 80);
  assert.equal(result.targetWeightKg, 88.9);
});

test('BMR exposes Mifflin and optional Katch model', () => {
  const result = bmr({ sex: 'male', weightKg: 80, heightCm: 180, age: 30, bodyFatPercent: 15 });
  assert.equal(result.mifflin, 1780);
  assert.ok(result.katch > 1800);
  assert.ok(result.range[0] <= result.central && result.central <= result.range[1]);
});

test('TDEE returns an uncertainty range around central estimate', () => {
  const result = tdee({ bmrKcal: 1800, activityFactor: 1.5 });
  assert.equal(result.central, 2700);
  assert.deepEqual(result.range, [2430, 2970]);
});

test('goal calories are monotonic for loss and gain', () => {
  const maintain = goalCalories({ maintenanceKcal: 2800, goal: 'maintain', weightKg: 80 });
  const loss = goalCalories({ maintenanceKcal: 2800, goal: 'loss', weightKg: 80, weeklyRatePercent: 0.5 });
  const gain = goalCalories({ maintenanceKcal: 2800, goal: 'gain', weightKg: 80, weeklyRatePercent: 0.5 });
  assert.equal(maintain.target, 2800);
  assert.ok(loss.target < maintain.target);
  assert.ok(gain.target > maintain.target);
});

test('protein target is a range and deficit raises the range', () => {
  const normal = proteinTarget({ weightKg: 80, goal: 'maintain' });
  const loss = proteinTarget({ weightKg: 80, goal: 'loss' });
  assert.ok(normal.lowGrams < normal.highGrams);
  assert.ok(loss.lowGrams > normal.lowGrams);
});

test('macro planner closes calorie budget', () => {
  const result = macroPlan({ calories: 2500, proteinGrams: 180, fatGrams: 70 });
  const kcal = result.proteinGrams * 4 + result.fatGrams * 9 + result.carbsGrams * 4;
  assert.ok(Math.abs(kcal - 2500) <= 2);
  assert.equal(macroPlan({ calories: 1000, proteinGrams: 250, fatGrams: 100 }), null);
});

test('fiber target scales with calories', () => {
  assert.equal(fiberTarget({ calories: 2000 }).grams, 28);
  assert.equal(fiberTarget({ calories: 3000 }).grams, 42);
});

test('heart rate zones support HRR when resting HR exists', () => {
  const zones = heartRateZones({ maxHr: 190, restingHr: 60 });
  assert.equal(zones.length, 5);
  assert.equal(zones[0].method, 'HRR');
  assert.ok(zones[4].high > zones[0].high);
});

test('pace calculator returns expected speed and carries rounded seconds', () => {
  const result = paceFromDistanceTime({ distanceKm: 5, minutes: 25 });
  assert.equal(result.display, '5:00');
  assert.equal(result.speedKmh, 12);
  const boundary = paceFromDistanceTime({ distanceKm: 1, minutes: 4.999 });
  assert.equal(boundary.display, '5:00');
});

test('Riegel predictor is deterministic', () => {
  const result = riegelPredict({ distance1Km: 5, time1Minutes: 25, distance2Km: 10 });
  assert.ok(result.predictedMinutes > 50);
  assert.ok(result.predictedMinutes < 55);
});

test('adaptive expenditure refuses sparse data', () => {
  const result = adaptiveExpenditure({ days: [{ date: '2026-09-01', calories: 2500, weightKg: 80 }] });
  assert.equal(result.status, 'insufficient');
});

test('adaptive expenditure uses intake and weight change transparently', () => {
  const days = Array.from({ length: 14 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
    calories: 2500,
    weightKg: 80 - i * 0.05,
  }));
  const result = adaptiveExpenditure({ days });
  assert.equal(result.status, 'ok');
  assert.equal(result.completeDays, 14);
  assert.ok(result.central > 2500);
  assert.ok(result.range[0] < result.central && result.central < result.range[1]);
  assert.equal(result.smoothing, '3-day edge mean');
});

test('adaptive expenditure dampens a single noisy endpoint', () => {
  const days = Array.from({ length: 14 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
    calories: 2500,
    weightKg: 80 - i * 0.05,
  }));
  days[13].weightKg += 1.2;
  const result = adaptiveExpenditure({ days });
  assert.equal(result.status, 'ok');
  assert.ok(result.weightChangeKg < 0.2);
});
