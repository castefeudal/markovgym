import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptiveExpenditure,
  bmrMifflinStJeor,
  bodyCompositionFromFat,
  calculatePlates,
  calorieTargetRange,
  convertRepMax,
  convertUnits,
  cooperVo2FromDistance,
  estimateOneRepMax,
  heartRateReserveZones,
  loadFromOneRepMax,
  macroPlan,
  metCalories,
  paceFromDistanceTime,
  proteinRange,
  riegelPrediction,
  rockportVo2,
  sessionVolume,
  targetWeightAtBodyFat,
  tdeeEstimate,
  waistToHeight,
  warmupRamp,
} from '../tools/gym-calculators.mjs';

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

test('percentage and rep conversion remain deterministic', () => {
  assert.deepEqual(loadFromOneRepMax(100, 82.5, 2.5), { raw: 82.5, rounded: 82.5, percent: 82.5, increment: 2.5 });
  const converted = convertRepMax(100, 5, 10);
  assert.ok(converted.central > 85 && converted.central < 87);
  assert.equal(converted.toReps, 10);
});

test('plate calculator returns exact and nearest achievable loads', () => {
  const exact = calculatePlates({ targetTotal: 100, barWeight: 20, availablePairs: { 25: 2, 20: 2, 10: 2, 5: 2 } });
  assert.equal(exact.exact, true);
  assert.equal(exact.achievedTotal, 100);
  assert.deepEqual(exact.perSide, [20, 20]);
  const near = calculatePlates({ targetTotal: 101, barWeight: 20, availablePairs: { 25: 2, 5: 2 } });
  assert.equal(near.exact, false);
  assert.equal(near.achievedTotal, 90);
});

test('warm-up ramp excludes working set', () => {
  const result = warmupRamp({ workingWeight: 100, barWeight: 20, increment: 2.5 });
  assert.ok(result.length >= 3);
  assert.ok(result.every((set) => set.weight < 100));
});

test('volume counts completed weighted sets only', () => {
  assert.equal(sessionVolume([
    { weight: 100, reps: 5, completed: true },
    { weight: 80, reps: 8, completed: false },
    { weight: '', reps: 12, completed: true },
  ]), 500);
});

test('Mifflin-St Jeor, TDEE and calorie target expose ranges', () => {
  const bmr = bmrMifflinStJeor({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 });
  assert.equal(bmr.kcal, 1780);
  const tdee = tdeeEstimate({ bmr: bmr.kcal, activityFactor: 1.55 });
  assert.equal(tdee.central, 2759);
  assert.ok(tdee.range[0] < tdee.central && tdee.range[1] > tdee.central);
  const cut = calorieTargetRange({ maintenanceKcal: tdee.central, goal: 'cut', rate: 'moderate' });
  assert.ok(cut.range[0] < cut.range[1]);
  assert.ok(cut.range[1] < tdee.central);
});

test('protein and macro planner return practical ranges', () => {
  const protein = proteinRange({ weightKg: 100, goal: 'cut', resistanceTraining: true });
  assert.deepEqual(protein.grams, [180, 240]);
  const macros = macroPlan({ calories: 2500, proteinG: 200, fatG: 70 });
  assert.equal(macros.carbsG, 267.5);
});

test('body composition estimates declare lean-mass assumption', () => {
  const body = bodyCompositionFromFat({ weightKg: 100, bodyFatPct: 20 });
  assert.deepEqual(body, { fatMassKg: 20, leanMassKg: 80, bodyFatPct: 20 });
  const target = targetWeightAtBodyFat({ weightKg: 100, currentBodyFatPct: 20, targetBodyFatPct: 10 });
  assert.equal(target.targetWeightKg, 88.89);
  assert.equal(target.assumption, 'lean-mass-held-constant');
  assert.equal(waistToHeight({ waistCm: 90, heightCm: 180 }), 0.5);
});

test('cardio field calculators are explicit estimates', () => {
  const zones = heartRateReserveZones({ age: 30, restingHr: 60 });
  assert.equal(zones.hrMax, 187);
  assert.equal(zones.zones.length, 5);
  assert.equal(cooperVo2FromDistance(3000).confidence, 'field-estimate');
  assert.equal(rockportVo2({ weightKg: 80, age: 30, sex: 'male', timeMinutes: 12, heartRate: 130 }).confidence, 'field-estimate');
  assert.ok(riegelPrediction({ knownDistanceKm: 5, knownTimeMinutes: 25, targetDistanceKm: 10 }).minutes > 50);
});

test('pace, MET and unit conversions work in both directions', () => {
  const pace = paceFromDistanceTime({ distanceKm: 10, timeMinutes: 50 });
  assert.equal(pace.minPerKm, 5);
  assert.equal(pace.kmh, 12);
  assert.equal(metCalories({ met: 8, weightKg: 80, minutes: 60 }).kcal, 672);
  assert.equal(convertUnits(100, 'kg', 'lb'), 220.462);
  assert.equal(convertUnits(convertUnits(100, 'kg', 'lb'), 'lb', 'kg'), 100);
});


test('adaptive expenditure refuses sparse data and exposes coverage', () => {
  const sparse = adaptiveExpenditure([
    { date: '2026-09-01', calories: 2500, weight: 80 },
    { date: '2026-09-14', calories: 2500, weight: 79.8 },
  ]);
  assert.equal(sparse.ready, false);
  assert.equal(sparse.reason, 'insufficient-data');
});

test('adaptive expenditure combines intake and smoothed weight trend transparently', () => {
  const entries = Array.from({ length: 21 }, (_, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, '0')}`,
    calories: 2500,
    weight: 80 - index * 0.03,
  }));
  const result = adaptiveExpenditure(entries);
  assert.equal(result.ready, true);
  assert.equal(result.loggedDays, 21);
  assert.equal(result.coverage, 1);
  assert.equal(result.confidence, 'moderate');
  assert.ok(result.central > result.averageCalories);
  assert.ok(result.range[0] < result.central && result.range[1] > result.central);
  assert.equal(result.methodVersion, 'transparent-energy-balance-v1');
});
